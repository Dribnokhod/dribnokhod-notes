import unittest
import test_roles
from app import main


class FolderDeletionTests(unittest.TestCase):
    setUp = test_roles.RoleAccessTests.setUp
    tearDown = test_roles.RoleAccessTests.tearDown
    write_note = test_roles.RoleAccessTests.write_note
    login_as = test_roles.RoleAccessTests.login_as

    def folder(self, private=False):
        (main.NOTES / 'folder' / 'nested').mkdir(parents=True)
        self.write_note('folder/nested/page.md', published=False, private=private)
        (main.NOTES / 'folder' / 'attachment.txt').write_text('attachment')

    def test_folder_and_contents_can_be_restored_together(self):
        self.folder()
        self.login_as('admin')
        token = self.client.post('/api/shares?path=folder/nested/page.md', json={'mode': 'view'}).get_json()['links']['view']
        self.assertEqual(self.client.delete('/api/folder?path=folder').status_code, 200)
        self.assertFalse((main.NOTES / 'folder').exists())
        items = self.client.get('/api/trash').get_json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['type'], 'folder')
        self.assertEqual(items[0]['original_path'], 'folder')
        restored = self.client.post('/api/trash/restore', json={'path': items[0]['trash_path']})
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(restored.get_json()['type'], 'folder')
        self.assertTrue((main.NOTES / 'folder/nested/page.md').is_file())
        self.assertEqual((main.NOTES / 'folder/attachment.txt').read_text(), 'attachment')
        self.assertEqual(self.client.get('/api/shared/' + token).status_code, 404)

    def test_developer_cannot_delete_or_restore_private_folder(self):
        self.folder(private=True)
        self.login_as('developer')
        self.assertEqual(self.client.delete('/api/folder?path=folder').status_code, 403)
        self.assertTrue((main.NOTES / 'folder/nested/page.md').exists())
        self.login_as('admin')
        self.client.delete('/api/folder?path=folder')
        path = self.client.get('/api/trash').get_json()[0]['trash_path']
        self.login_as('developer')
        self.assertEqual(self.client.get('/api/trash').get_json(), [])
        self.assertEqual(self.client.post('/api/trash/restore', json={'path': path}).status_code, 404)
        self.assertEqual(self.client.delete('/api/trash', query_string={'path': path}).status_code, 404)

    def test_empty_folder_permanent_delete_and_invalid_targets(self):
        (main.NOTES / 'empty').mkdir()
        self.assertEqual(self.client.delete('/api/folder?path=empty').status_code, 401)
        self.login_as('developer')
        for path in ('', '.', '../outside', 'public.md', 'missing'):
            self.assertIn(self.client.delete('/api/folder', query_string={'path': path}).status_code, (400, 404))
        self.assertTrue(main.NOTES.exists())
        self.assertEqual(self.client.delete('/api/folder?path=empty').status_code, 200)
        path = self.client.get('/api/trash').get_json()[0]['trash_path']
        self.assertEqual(self.client.delete('/api/trash', query_string={'path': path}).status_code, 200)
        self.assertEqual(self.client.get('/api/trash').get_json(), [])

    def test_restore_does_not_overwrite_existing_folder(self):
        self.folder()
        self.login_as('admin')
        self.client.delete('/api/folder?path=folder')
        path = self.client.get('/api/trash').get_json()[0]['trash_path']
        (main.NOTES / 'folder').mkdir()
        self.assertEqual(self.client.post('/api/trash/restore', json={'path': path}).status_code, 409)
