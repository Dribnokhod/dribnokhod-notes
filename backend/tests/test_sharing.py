import io
import unittest
import test_roles
from app import main


class SharingTests(unittest.TestCase):
    setUp = test_roles.RoleAccessTests.setUp
    tearDown = test_roles.RoleAccessTests.tearDown
    write_note = test_roles.RoleAccessTests.write_note
    login_as = test_roles.RoleAccessTests.login_as
    tree_paths = test_roles.RoleAccessTests.tree_paths

    def link(self, mode='view', path='draft.md'):
        self.login_as('admin')
        r = self.client.post('/api/shares', query_string={'path': path}, json={'mode': mode})
        self.assertEqual(r.status_code, 200)
        token = r.get_json()['links'][mode]
        self.client.post('/api/logout')
        return token

    def test_draft_and_private_are_accessible_only_with_link(self):
        for path in ('draft.md', 'private.md'):
            token = self.link(path=path)
            self.assertEqual(self.client.get('/api/shared/' + token).status_code, 200)
            self.assertEqual(self.client.get('/api/note', query_string={'path': path}).status_code, 404)
            self.assertNotIn(path, self.tree_paths())
        self.assertEqual(self.client.get('/api/shared/invalid').status_code, 404)

    def test_view_cannot_write_or_upload(self):
        token = self.link()
        self.assertEqual(self.client.put('/api/shared/' + token, json={'content': 'Changed'}).status_code, 403)
        self.assertEqual(self.client.post('/api/shared/' + token + '/upload', data={'file': (io.BytesIO(b'image'), 'test.png')}).status_code, 403)
        self.assertEqual(main.parse(main.NOTES / 'draft.md')[1], 'Content\n')

    def test_editor_can_edit_only_target_and_keeps_visibility(self):
        token = self.link('edit', 'private.md')
        r = self.client.put('/api/shared/' + token, json={
            'path': 'public.md', 'content': 'Shared edit',
            'meta': {'title': 'New title', 'private': False, 'published': False, 'start_page': True},
        })
        self.assertEqual(r.status_code, 200)
        meta, content = main.parse(main.NOTES / 'private.md')
        self.assertEqual(content, 'Shared edit')
        self.assertEqual(meta['title'], 'New title')
        self.assertTrue(meta['private'])
        self.assertTrue(meta['published'])
        self.assertNotIn('start_page', meta)
        self.assertEqual(main.parse(main.NOTES / 'public.md')[1], 'Content\n')
        self.assertEqual(self.client.put('/api/note', json={'path': 'public.md', 'content': 'Bad'}).status_code, 401)
        self.assertEqual(self.client.post('/api/shares?path=private.md', json={'mode': 'edit'}).status_code, 401)
        self.assertEqual(self.client.post('/api/shared/' + token + '/upload', data={'file': (io.BytesIO(b'image'), 'test.png')}).status_code, 200)

    def test_rotation_and_revocation_are_independent_and_persistent(self):
        view = self.link()
        edit = self.link('edit')
        self.login_as('admin')
        self.assertEqual(self.client.get('/api/shares?path=draft.md').get_json()['links'], {'view': view, 'edit': edit})
        new_view = self.client.post('/api/shares?path=draft.md', json={'mode': 'view'}).get_json()['links']['view']
        self.assertNotEqual(view, new_view)
        self.assertEqual(self.client.get('/api/shared/' + view).status_code, 404)
        self.assertEqual(self.client.get('/api/shared/' + edit).status_code, 200)
        self.client.delete('/api/shares?path=draft.md', json={'mode': 'edit'})
        self.assertEqual(self.client.get('/api/shared/' + edit).status_code, 404)
        self.assertEqual(self.client.get('/api/shared/' + new_view).status_code, 200)

    def test_developer_cannot_share_private_and_invalid_modes_fail(self):
        self.login_as('developer')
        self.assertEqual(self.client.post('/api/shares?path=private.md', json={'mode': 'view'}).status_code, 404)
        self.assertEqual(self.client.post('/api/shares?path=draft.md', json={'mode': 'admin'}).status_code, 400)
        self.assertEqual(self.client.post('/api/shares?path=../outside.md', json={'mode': 'view'}).status_code, 404)
        self.assertEqual(self.client.post('/api/shares?path=draft.md', json={'mode': 'view'}).status_code, 200)

    def test_links_follow_folder_moves_and_deletion_revokes(self):
        token = self.link()
        self.login_as('admin')
        (main.NOTES / 'folder').mkdir()
        r = self.client.post('/api/move', json={'path': 'draft.md', 'folder': 'folder', 'type': 'note'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client.get('/api/shared/' + token).get_json()['path'], 'folder/draft.md')
        (main.NOTES / 'destination').mkdir()
        r = self.client.post('/api/move', json={'path': 'folder', 'folder': 'destination', 'type': 'folder'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client.get('/api/shared/' + token).get_json()['path'], 'destination/folder/draft.md')
        self.assertEqual(self.client.delete('/api/note?path=destination/folder/draft.md').status_code, 200)
        self.write_note('draft.md', published=False)
        self.assertEqual(self.client.get('/api/shared/' + token).status_code, 404)
