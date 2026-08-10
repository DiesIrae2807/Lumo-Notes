package com.lumonotes.app.data.sync

import com.lumonotes.app.data.sync.local.PendingChangeEntity
import com.lumonotes.app.data.sync.local.SeenChangeEntity
import com.lumonotes.app.data.sync.local.SyncStateDao
import com.lumonotes.app.data.sync.local.UploadedChangeEntity
import com.lumonotes.app.domain.createDefaultNote
import com.lumonotes.app.domain.Folder
import com.lumonotes.app.domain.Tag
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncStateRepositoryTest {
    private val dao = FakeSyncStateDao()
    private val tracker = RoomLocalChangeTracker(dao)

    @Test
    fun seenAndUploadedIdsAreIdempotent() = runTest {
        val repository = SyncStateRepository(FakeSyncPreferencesStore(), dao)

        assertTrue(repository.recordSeen("remote-1", timestamp, "device-desktop"))
        assertFalse(repository.recordSeen("remote-1", timestamp, "device-desktop"))
        assertTrue(repository.hasSeen("remote-1"))

        assertTrue(repository.recordUploaded("local-1", timestamp))
        assertFalse(repository.recordUploaded("local-1", timestamp))
        assertTrue(repository.hasUploaded("local-1"))
    }

    @Test
    fun pendingNotesRepresentCreateUpdateDeleteAndRestore() = runTest {
        val created = createDefaultNote(now = timestamp, id = "note-test")
        assertTrue(tracker.trackNote(created))
        assertEquals("upsert", dao.listPending().single().operation)

        val updated = created.copy(content = "changed", preview = "changed", updatedAt = later)
        assertTrue(tracker.trackNote(updated))
        assertEquals(later, dao.listPending().single().sourceUpdatedAt)

        val deleted = updated.copy(isDeleted = true, updatedAt = latest)
        assertTrue(tracker.trackNote(deleted))
        assertEquals("delete", dao.listPending().single().operation)

        val restored = deleted.copy(isDeleted = false, updatedAt = restoredAt)
        assertTrue(tracker.trackNote(restored))
        assertEquals("upsert", dao.listPending().single().operation)
        assertEquals(restoredAt, dao.listPending().single().sourceUpdatedAt)
    }

    @Test
    fun unchangedStateDoesNotCreateDuplicateAndPendingSurvivesRepositoryRecreation() = runTest {
        val note = createDefaultNote(now = timestamp, id = "note-test")

        assertTrue(tracker.trackNote(note))
        assertFalse(tracker.trackNote(note))
        assertEquals(1, dao.listPending().size)

        val recreatedTracker = RoomLocalChangeTracker(dao)
        assertFalse(recreatedTracker.trackNote(note))
        assertEquals(1, dao.listPending().size)
    }

    @Test
    fun folderAndTagUpsertsAreTrackable() = runTest {
        val folder = Folder("projects", "Projects", "bg-slate-400", timestamp, timestamp)
        val tag = Tag("work", "work", timestamp, timestamp)

        assertTrue(tracker.trackFolder(folder))
        assertTrue(tracker.trackTag(tag))

        val pending = dao.listPending().associateBy { it.key }
        assertEquals("upsert", pending.getValue("folder:projects").operation)
        assertEquals("upsert", pending.getValue("tag:work").operation)
    }

    @Test
    fun uploadedChangeClearsOnlyThePendingStateThatWasUploaded() = runTest {
        val repository = SyncStateRepository(FakeSyncPreferencesStore(), dao)
        val note = createDefaultNote(now = timestamp, id = "note-test")
        tracker.trackNote(note)
        val firstPending = dao.listPending().single()

        tracker.trackNote(note.copy(content = "newer", preview = "newer", updatedAt = later))
        assertFalse(repository.completePending(firstPending))
        assertEquals(later, dao.listPending().single().sourceUpdatedAt)

        val current = dao.listPending().single()
        assertTrue(repository.markPendingUploaded(current, "change-id", latest))
        assertTrue(repository.hasUploaded("change-id"))
        assertTrue(dao.listPending().isEmpty())
    }

    companion object {
        private const val timestamp = "2026-07-05T12:34:56.007Z"
        private const val later = "2026-07-05T12:35:00.001Z"
        private const val latest = "2026-07-05T12:36:00.002Z"
        private const val restoredAt = "2026-07-05T12:37:00.003Z"
    }
}

private class FakeSyncStateDao : SyncStateDao {
    private val seen = mutableMapOf<String, SeenChangeEntity>()
    private val uploaded = mutableMapOf<String, UploadedChangeEntity>()
    private val pending = MutableStateFlow<List<PendingChangeEntity>>(emptyList())

    override suspend fun insertSeen(change: SeenChangeEntity): Long =
        if (seen.putIfAbsent(change.changeId, change) == null) 1 else -1

    override suspend fun hasSeen(changeId: String) = changeId in seen

    override suspend fun pruneSeen(keep: Int) {
        val retained = seen.values.sortedWith(compareByDescending<SeenChangeEntity> { it.appliedAt }.thenByDescending { it.changeId })
            .take(keep)
            .mapTo(mutableSetOf()) { it.changeId }
        seen.keys.retainAll(retained)
    }

    override suspend fun insertUploaded(change: UploadedChangeEntity): Long =
        if (uploaded.putIfAbsent(change.changeId, change) == null) 1 else -1

    override suspend fun hasUploaded(changeId: String) = changeId in uploaded

    override suspend fun getPending(key: String) = pending.value.firstOrNull { it.key == key }

    override fun observePending(): Flow<List<PendingChangeEntity>> = pending

    override suspend fun listPending(): List<PendingChangeEntity> = pending.value

    override suspend fun upsertPending(change: PendingChangeEntity) {
        pending.value = pending.value.filterNot { it.key == change.key } + change
    }

    override suspend fun deletePendingIfCurrent(key: String, stateFingerprint: String): Int {
        val found = pending.value.any { it.key == key && it.stateFingerprint == stateFingerprint }
        if (found) pending.value = pending.value.filterNot { it.key == key }
        return if (found) 1 else 0
    }
}

private class FakeSyncPreferencesStore : SyncPreferencesStore {
    override suspend fun getOrCreateDeviceIdentity() = DeviceIdentity("device-test", "Test", "2026-07-05T12:34:56.007Z")
    override suspend fun updateDeviceName(name: String) = getOrCreateDeviceIdentity().copy(deviceName = name)
    override suspend fun readSyncState() = PersistentSyncState(null, null, SyncStatus.Idle, null, null, null, null)
    override suspend fun recordAttempt(timestamp: String, status: SyncStatus) = Unit
    override suspend fun recordSuccess(timestamp: String) = Unit
    override suspend fun recordError(status: SyncStatus, category: SyncErrorCategory, message: String) = Unit
    override suspend fun setStatus(status: SyncStatus) = Unit
    override suspend fun setDriveFileIds(syncManifestFileId: String?, backupManifestFileId: String?) = Unit
    override suspend fun setCloudPasswordMetadata(metadata: CloudPasswordVerifierMetadata?) = Unit
}
