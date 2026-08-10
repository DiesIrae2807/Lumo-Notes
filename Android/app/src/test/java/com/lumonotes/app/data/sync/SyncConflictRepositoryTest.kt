package com.lumonotes.app.data.sync

import com.lumonotes.app.data.sync.local.SyncConflictDao
import com.lumonotes.app.data.sync.local.SyncConflictEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncConflictRepositoryTest {
    @Test
    fun conflictPreservesBothPayloadsAndCanBeResolved() = runTest {
        val dao = FakeSyncConflictDao()
        val repository = SyncConflictRepository(dao)
        val conflict = conflict()

        val stored = repository.create(conflict)

        assertEquals("{\"notes\":[{\"title\":\"local\"}]}", stored.localPayload)
        assertEquals("{\"notes\":[{\"title\":\"remote\"}]}", stored.remotePayload)
        assertEquals("2026-07-05T12:30:00.000Z", stored.localUpdatedAt)
        assertEquals("2026-07-05T12:31:00.000Z", stored.remoteCreatedAt)
        assertEquals(listOf(conflict), repository.listUnresolved())

        assertTrue(repository.markResolved(conflict.id, ConflictResolution.KeepBoth, resolvedAt, "note-conflict-copy"))
        assertTrue(repository.listUnresolved().isEmpty())
        assertFalse(repository.markResolved(conflict.id, ConflictResolution.KeepLocal, resolvedAt))
    }

    @Test
    fun duplicateRemoteChangeReturnsOriginalConflict() = runTest {
        val repository = SyncConflictRepository(FakeSyncConflictDao())
        val original = repository.create(conflict())
        val duplicate = repository.create(conflict().copy(id = "different-id", localPayload = "different"))

        assertEquals(original, duplicate)
    }

    private fun conflict() = SyncConflictEntity(
        id = "sync-conflict-remote-change-1",
        entityType = "note",
        entityId = "note-test",
        localPayload = "{\"notes\":[{\"title\":\"local\"}]}",
        remotePayload = "{\"notes\":[{\"title\":\"remote\"}]}",
        localUpdatedAt = "2026-07-05T12:30:00.000Z",
        remoteCreatedAt = "2026-07-05T12:31:00.000Z",
        localDeviceId = "device-android",
        remoteDeviceId = "device-desktop",
        remoteChangeId = "remote-change-1",
        detectedAt = "2026-07-05T12:32:00.000Z",
        status = "unresolved",
        resolution = null,
        resolvedAt = null,
        resultEntityId = null,
        resolutionSyncedAt = null,
    )

    companion object {
        private const val resolvedAt = "2026-07-05T12:33:00.000Z"
    }
}

private class FakeSyncConflictDao : SyncConflictDao {
    private val conflicts = MutableStateFlow<List<SyncConflictEntity>>(emptyList())

    override suspend fun insert(conflict: SyncConflictEntity): Long {
        if (conflicts.value.any { it.remoteChangeId == conflict.remoteChangeId }) return -1
        conflicts.value += conflict
        return 1
    }

    override suspend fun getByRemoteChangeId(remoteChangeId: String): SyncConflictEntity? =
        conflicts.value.firstOrNull { it.remoteChangeId == remoteChangeId }

    override fun observeUnresolved(): Flow<List<SyncConflictEntity>> = conflicts

    override suspend fun listUnresolved(): List<SyncConflictEntity> =
        conflicts.value.filter { it.status == "unresolved" }.sortedByDescending { it.detectedAt }

    override suspend fun markResolved(id: String, resolution: String, resolvedAt: String, resultEntityId: String?): Int {
        val existing = conflicts.value.firstOrNull { it.id == id && it.status == "unresolved" } ?: return 0
        conflicts.value = conflicts.value.map {
            if (it.id == id) {
                existing.copy(
                    status = "resolved",
                    resolution = resolution,
                    resolvedAt = resolvedAt,
                    resultEntityId = resultEntityId,
                    resolutionSyncedAt = null,
                )
            } else {
                it
            }
        }
        return 1
    }
}
