import unittest
import test_roles
from app import main


class FolderSharingTests(unittest.TestCase):
    setUp = test_roles.RoleAccessTests.setUp
    tearDown = test_roles.RoleAccessTests.tearDown
    write_note = test_roles.RoleAccessTests.write_note
    login_as = test_roles.RoleAccessTests.login_as

    def folder_link(self, mode='view'):
        (main.NOTES / 'folder' / 'nested').mkdir(parents=True)
        self.write_note('folder/draft.md', published=False)
        self.write_note('folder/nested/page.md', published=True)
        self.write_note('folder/private.md', published=False, private=True)
        self.login_as('admin')
        token = self.client.post('/api/shares?path=folder', json={'mode': mode}).get_json()['links'][mode]
        self.client.post('/api/logout')
        return token

    def test_folder_lists_nested_drafts_but_not_private_notes(self):
        token = self.folder_link()
        data = self.client.get('/api/shared/' + token).get_json()
        self.assertEqual(data['type'], 'folder')
        self.assertEqual({x['path'] for x in data['tree']}, {'folder/nested', 'folder/draft.md'})
        self.assertEqual(data['tree'][0]['children'][0]['path'], 'folder/nested/page.md')
        self.assertEqual(self.client.get('/api/shared/' + token + '?path=folder/draft.md').status_code, 200)
        self.assertEqual(self.client.put('/api/shared/' + token, json={'path': 'folder/draft.md', 'content': 'No'}).status_code, 403)

    def test_editor_is_scoped_and_cannot_change_visibility(self):
        token = self.folder_link('edit')
        for path in ('public.md', 'private.md', 'folder/private.md', 'folder/../../private.md', '/etc/passwd', 'folder/new.md'):
            self.assertEqual(self.client.get('/api/shared/' + token, query_string={'path': path}).status_code, 404)
            self.assertEqual(self.client.put('/api/shared/' + token, json={'path': path, 'content': 'Bad'}).status_code, 404)
        r = self.client.put('/api/shared/' + token, json={'path': 'folder/draft.md', 'content': 'Changed', 'meta': {'title': 'Edited', 'published': True, 'private': True}})
        self.assertEqual(r.status_code, 200)
        meta, content = main.parse(main.NOTES / 'folder/draft.md')
        self.assertEqual(content, 'Changed')
        self.assertFalse(meta['published'])
        self.assertFalse(meta.get('private', False))

    def test_new_notes_moves_and_folder_deletion(self):
        token = self.folder_link()
        self.write_note('folder/added.md', published=False)
        self.assertEqual(self.client.get('/api/shared/' + token + '?path=folder/added.md').status_code, 200)
        self.login_as('admin')
        (main.NOTES / 'destination').mkdir()
        self.client.post('/api/move', json={'path': 'folder', 'folder': 'destination', 'type': 'folder'})
        self.assertEqual(self.client.get('/api/shared/' + token).get_json()['path'], 'destination/folder')
        self.assertEqual(self.client.get('/api/shared/' + token + '?path=destination/folder/added.md').status_code, 200)
        self.client.delete('/api/folder?path=destination/folder')
        self.assertEqual(self.client.get('/api/shared/' + token).status_code, 404)
        item = self.client.get('/api/trash').get_json()[0]
        self.client.post('/api/trash/restore', json={'path': item['trash_path']})
        self.assertEqual(self.client.get('/api/shared/' + token).status_code, 404)

    def test_folder_rotation_and_note_type_are_preserved(self):
        token = self.folder_link()
        self.login_as('admin')
        replacement = self.client.post('/api/shares?path=folder', json={'mode': 'view'}).get_json()['links']['view']
        self.assertEqual(self.client.get('/api/shared/' + token).status_code, 404)
        self.assertEqual(self.client.get('/api/shared/' + replacement).status_code, 200)
        token = self.client.post('/api/shares?path=draft.md', json={'mode': 'view'}).get_json()['links']['view']
        (main.NOTES / 'draft.md').unlink()
        (main.NOTES / 'draft.md').mkdir()
        self.assertEqual(self.client.get('/api/shared/' + token).status_code, 404)
        self.assertEqual(self.client.post('/api/shares?path=.', json={'mode': 'view'}).status_code, 404)
