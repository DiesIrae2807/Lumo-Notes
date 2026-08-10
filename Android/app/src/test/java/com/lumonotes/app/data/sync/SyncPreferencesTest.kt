package com.lumonotes.app.data.sync

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.security.SecureRandom
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class SyncPreferencesTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    @Test
    fun identityIsGeneratedOnceAndSurvivesStoreRecreation() = runBlocking {
        val file = temporaryFolder.newFile("sync.preferences_pb")
        file.delete()
        val firstScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val firstStore = store(file.absolutePath, firstScope)

        val first = firstStore.getOrCreateDeviceIdentity()
        val repeated = firstStore.getOrCreateDeviceIdentity()
        firstScope.cancel()

        val secondScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val recreated = store(file.absolutePath, secondScope).getOrCreateDeviceIdentity()
        secondScope.cancel()

        assertEquals(first, repeated)
        assertEquals(first, recreated)
        assertTrue(first.deviceId.matches(Regex("device-[A-Za-z0-9_-]{24}")))
        assertEquals("2026-07-05T12:34:56.007Z", first.createdAt)
    }

    @Test
    fun updatingNamePreservesIdentityFields() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = newStore(scope)
        val original = store.getOrCreateDeviceIdentity()

        val renamed = store.updateDeviceName("Hamza's Phone")
        scope.cancel()

        assertEquals(original.deviceId, renamed.deviceId)
        assertEquals(original.createdAt, renamed.createdAt)
        assertEquals("Hamza's Phone", renamed.deviceName)
    }

    @Test
    fun syncTimestampsStatusErrorsAndVerifierMetadataPersist() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = newStore(scope)
        val attemptedAt = "2026-07-05T12:34:56.007Z"
        val successfulAt = "2026-07-05T12:35:01.123Z"

        store.recordAttempt(attemptedAt)
        assertEquals(attemptedAt, store.readSyncState().lastAttemptedSyncAt)
        assertEquals(SyncStatus.Syncing, store.readSyncState().status)

        store.recordError(SyncStatus.PasswordRequired, SyncErrorCategory.WrongPassword, "Password required")
        assertEquals(SyncErrorState(SyncErrorCategory.WrongPassword, "Password required"), store.readSyncState().error)

        store.recordSuccess(successfulAt)
        store.setDriveFileIds("sync-manifest-file", null)
        val metadata = CloudPasswordVerifierMetadata(
            salt = "salt-base64",
            verifier = "verifier-base64",
            kdfAlgorithm = "argon2id",
            kdfParams = "m=19456,t=2,p=1",
            encryptionAlgorithm = "XChaCha20-Poly1305",
        )
        store.setCloudPasswordMetadata(metadata)
        val state = store.readSyncState()
        scope.cancel()

        assertEquals(successfulAt, state.lastSuccessfulSyncAt)
        assertEquals(attemptedAt, state.lastAttemptedSyncAt)
        assertEquals(SyncStatus.Success, state.status)
        assertNull(state.error)
        assertEquals("sync-manifest-file", state.syncManifestFileId)
        assertEquals(metadata, state.passwordMetadata)
    }

    private fun newStore(scope: CoroutineScope): DataStoreSyncPreferencesStore {
        val file = temporaryFolder.newFile("sync-${System.nanoTime()}.preferences_pb")
        file.delete()
        return store(file.absolutePath, scope)
    }

    private fun store(path: String, scope: CoroutineScope): DataStoreSyncPreferencesStore =
        DataStoreSyncPreferencesStore(
            dataStore = PreferenceDataStoreFactory.create(scope = scope) { java.io.File(path) },
            clock = Clock.fixed(Instant.parse("2026-07-05T12:34:56.007Z"), ZoneOffset.UTC),
            random = FixedSecureRandom(),
            defaultDeviceName = { "Android Test Phone" },
        )
}

private class FixedSecureRandom : SecureRandom() {
    override fun nextBytes(bytes: ByteArray) {
        bytes.indices.forEach { bytes[it] = it.toByte() }
    }
}
