import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import main


class RoleAccessTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        main.NOTES = root / 'notes'
        main.UP = root / 'uploads'
        main.TRASH = root / 'trash'
        main.NOTES.mkdir()
        main.UP.mkdir()
        main.TRASH.mkdir()
        main.app.config.update(TESTING=True, SECRET_KEY='test-secret')
        self.client = main.app.test_client()

        self.write_note('public.md', published=True)
        self.write_note('draft.md', published=False)
        self.write_note('private.md', published=True, private=True)

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_note(self, name, **meta):
        fields = {'title': name, **meta}
        frontmatter = ''.join(f'{key}: {str(value).lower() if isinstance(value, bool) else value}\n' for key, value in fields.items())
        (main.NOTES / name).write_text(f'---\n{frontmatter}---\nContent\n', encoding='utf8')

    def login_as(self, role):
        with self.client.session_transaction() as session:
            session['role'] = role

    def tree_paths(self):
        def flatten(items):
            return [item['path'] for item in items if item['type'] == 'note'] + [path for item in items if item['type'] == 'folder' for path in flatten(item['children'])]
        return flatten(self.client.get('/api/tree').get_json())

    def test_each_role_sees_only_its_allowed_pages(self):
        self.assertEqual(self.tree_paths(), ['public.md'])

        self.login_as('developer')
        self.assertEqual(set(self.tree_paths()), {'public.md', 'draft.md'})
        self.assertEqual(self.client.get('/api/note?path=private.md').status_code, 404)

        self.login_as('admin')
        self.assertEqual(set(self.tree_paths()), {'public.md', 'draft.md', 'private.md'})
        self.assertEqual(self.client.get('/api/note?path=private.md').status_code, 200)

    def test_developer_cannot_create_private_page_through_api(self):
        self.login_as('developer')
        response = self.client.put('/api/note', json={
            'path': 'draft.md',
            'meta': {'title': 'draft.md', 'private': True},
            'content': 'Changed',
        })
        self.assertEqual(response.status_code, 403)
        self.assertFalse(main.parse(main.NOTES / 'draft.md')[0].get('private', False))

    def test_passwords_create_distinct_roles(self):
        with patch.dict('os.environ', {
            'NOTES_ADMIN_PASSWORD': 'admin-pass',
            'NOTES_DEVELOPER_PASSWORD': 'developer-pass',
        }):
            response = self.client.post('/api/login', json={'password': 'developer-pass'})
            self.assertEqual(response.get_json()['role'], 'developer')
            self.assertEqual(self.client.get('/api/me').get_json()['role'], 'developer')

            response = self.client.post('/api/login', json={'password': 'admin-pass'})
            self.assertEqual(response.get_json()['role'], 'admin')
            self.assertTrue(self.client.get('/api/me').get_json()['admin'])


if __name__ == '__main__':
    unittest.main()
