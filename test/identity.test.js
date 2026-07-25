import test from 'node:test';
import assert from 'node:assert/strict';
import {
    canonicalDocumentPath,
    canonicalUid,
    identityForPath,
    slugSegment
} from '../packages/content-structure/src/identity.js';

test('shared slug rule preserves URL-safe underscores and normalizes unsafe separators', () => {
    assert.equal(slugSegment('  Thréad__Sensor.Tag~One  '), 'Thread__Sensor.Tag~One');
    assert.equal(slugSegment('___'), '___');
    assert.equal(slugSegment('..'), 'page');
});

test('shared identity derives url and uid only from the relative path', () => {
    assert.deepEqual(identityForPath('My Folder/Thread_SensorTag.md', false), {
        slug: 'Thread_SensorTag',
        url: 'My-Folder/Thread_SensorTag',
        uid: 'My-Folder.Thread_SensorTag',
        url_type: 'file'
    });
    assert.deepEqual(identityForPath('My Folder/index.md', true), {
        slug: 'My-Folder',
        url: 'My-Folder',
        uid: 'My-Folder',
        url_type: 'dir'
    });
});

test('reference keys and authored card uids preserve underscores', () => {
    assert.equal(canonicalDocumentPath('My Folder/Thread_SensorTag.md'), 'My-Folder/Thread_SensorTag');
    assert.equal(canonicalUid('My_Folder.Thread SensorTag'), 'My_Folder.Thread-SensorTag');
});
