package com.lumonotes.app.data.sync

import android.content.Context
import android.os.Build
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.lumonotes.app.domain.contractNow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.security.SecureRandom
import java.time.Clock
import java.util.Base64

enum class SyncStatus(val value: String) {
    Idle("idle"),
    Ready("ready"),
    Syncing("syncing"),
    Success("success"),
    Error("error"),
    PasswordRequired("passwordRequired"),
    Conflict("conflict");

    companion object {
        fun from(value: String?): SyncStatus = entries.firstOrNull { it.value == value } ?: Idle
    }
}

enum class SyncErrorCategory(val value: String) {
    Authentication("authentication"),
    Network("network"),
    WrongPassword("wrongPassword"),
    Corruption("corruption"),
    Checksum("checksum"),
    UnsupportedFormat("unsupportedFormat"),
    Manifest("manifest"),
    LocalDatabase("localDatabase"),
    Conflict("conflict"),
    Unknown("unknown");

    companion object {
        fun from(value: String?): SyncErrorCategory? = entries.firstOrNull { it.value == value }
    }
}

data class DeviceIdentity(
    val deviceId: String,
    val deviceName: String,
    val createdAt: String,
)

data class SyncErrorState(
    val category: SyncErrorCategory,
    val message: String,
)

data class CloudPasswordVerifierMetadata(
    val salt: String,
    val verifier: String,
    val kdfAlgorithm: String,
    val kdfParams: String,
    val encryptionAlgorithm: String,
)

data class PersistentSyncState(
    val lastSuccessfulSyncAt: String?,
    val lastAttemptedSyncAt: String?,
    val status: SyncStatus,
    val error: SyncErrorState?,
    val syncManifestFileId: String?,
    val backupManifestFileId: String?,
    val passwordMetadata: CloudPasswordVerifierMetadata?,
)

interface SyncPreferencesStore {
    suspend fun getOrCreateDeviceIdentity(): DeviceIdentity
    suspend fun updateDeviceName(name: String): DeviceIdentity
    suspend fun readSyncState(): PersistentSyncState
    suspend fun recordAttempt(timestamp: String, status: SyncStatus = SyncStatus.Syncing)
    suspend fun recordSuccess(timestamp: String)
    suspend fun recordError(status: SyncStatus, category: SyncErrorCategory, message: String)
    suspend fun setStatus(status: SyncStatus)
    suspend fun setDriveFileIds(syncManifestFileId: String?, backupManifestFileId: String?)
    suspend fun setCloudPasswordMetadata(metadata: CloudPasswordVerifierMetadata?)
}

private val Context.syncDataStore by preferencesDataStore(name = "lumo-sync-state")

class DataStoreSyncPreferencesStore(
    private val dataStore: DataStore<Preferences>,
    private val clock: Clock = Clock.systemUTC(),
    private val random: SecureRandom = SecureRandom(),
    private val defaultDeviceName: () -> String = ::androidDeviceName,
) : SyncPreferencesStore {
    constructor(context: Context) : this(context.syncDataStore)

    private val identityMutex = Mutex()

    override suspend fun getOrCreateDeviceIdentity(): DeviceIdentity = identityMutex.withLock {
        val existing = identity(dataStore.data.first())
        if (existing != null) return existing
        val created = DeviceIdentity(
            deviceId = "device-${Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(18).also(random::nextBytes))}",
            deviceName = defaultDeviceName().trim().ifEmpty { "Android device" },
            createdAt = contractNow(clock),
        )
        dataStore.edit { preferences ->
            if (identity(preferences) == null) {
                preferences[Keys.deviceId] = created.deviceId
                preferences[Keys.deviceName] = created.deviceName
                preferences[Keys.deviceCreatedAt] = created.createdAt
            }
        }
        identity(dataStore.data.first()) ?: created
    }

    override suspend fun updateDeviceName(name: String): DeviceIdentity {
        val current = getOrCreateDeviceIdentity()
        val cleanName = name.trim().ifEmpty { current.deviceName }
        dataStore.edit { it[Keys.deviceName] = cleanName }
        return current.copy(deviceName = cleanName)
    }

    override suspend fun readSyncState(): PersistentSyncState {
        val preferences = dataStore.data.first()
        val errorCategory = SyncErrorCategory.from(preferences[Keys.errorCategory])
        val errorMessage = preferences[Keys.errorMessage]
        return PersistentSyncState(
            lastSuccessfulSyncAt = preferences[Keys.lastSuccessfulSyncAt],
            lastAttemptedSyncAt = preferences[Keys.lastAttemptedSyncAt],
            status = SyncStatus.from(preferences[Keys.status]),
            error = if (errorCategory != null && errorMessage != null) SyncErrorState(errorCategory, errorMessage) else null,
            syncManifestFileId = preferences[Keys.syncManifestFileId],
            backupManifestFileId = preferences[Keys.backupManifestFileId],
            passwordMetadata = passwordMetadata(preferences),
        )
    }

    override suspend fun recordAttempt(timestamp: String, status: SyncStatus) {
        dataStore.edit {
            it[Keys.lastAttemptedSyncAt] = timestamp
            it[Keys.status] = status.value
            it.remove(Keys.errorCategory)
            it.remove(Keys.errorMessage)
        }
    }

    override suspend fun recordSuccess(timestamp: String) {
        dataStore.edit {
            it[Keys.lastSuccessfulSyncAt] = timestamp
            it[Keys.status] = SyncStatus.Success.value
            it.remove(Keys.errorCategory)
            it.remove(Keys.errorMessage)
        }
    }

    override suspend fun recordError(status: SyncStatus, category: SyncErrorCategory, message: String) {
        require(status == SyncStatus.Error || status == SyncStatus.PasswordRequired || status == SyncStatus.Conflict)
        dataStore.edit {
            it[Keys.status] = status.value
            it[Keys.errorCategory] = category.value
            it[Keys.errorMessage] = message
        }
    }

    override suspend fun setStatus(status: SyncStatus) {
        dataStore.edit { it[Keys.status] = status.value }
    }

    override suspend fun setDriveFileIds(syncManifestFileId: String?, backupManifestFileId: String?) {
        dataStore.edit {
            setNullable(it, Keys.syncManifestFileId, syncManifestFileId)
            setNullable(it, Keys.backupManifestFileId, backupManifestFileId)
        }
    }

    override suspend fun setCloudPasswordMetadata(metadata: CloudPasswordVerifierMetadata?) {
        dataStore.edit {
            setNullable(it, Keys.passwordSalt, metadata?.salt)
            setNullable(it, Keys.passwordVerifier, metadata?.verifier)
            setNullable(it, Keys.passwordKdfAlgorithm, metadata?.kdfAlgorithm)
            setNullable(it, Keys.passwordKdfParams, metadata?.kdfParams)
            setNullable(it, Keys.passwordEncryptionAlgorithm, metadata?.encryptionAlgorithm)
        }
    }

    private fun identity(preferences: Preferences): DeviceIdentity? {
        val id = preferences[Keys.deviceId] ?: return null
        val name = preferences[Keys.deviceName] ?: return null
        val createdAt = preferences[Keys.deviceCreatedAt] ?: return null
        return DeviceIdentity(id, name, createdAt)
    }

    private fun passwordMetadata(preferences: Preferences): CloudPasswordVerifierMetadata? {
        val salt = preferences[Keys.passwordSalt] ?: return null
        val verifier = preferences[Keys.passwordVerifier] ?: return null
        val kdf = preferences[Keys.passwordKdfAlgorithm] ?: return null
        val params = preferences[Keys.passwordKdfParams] ?: return null
        val algorithm = preferences[Keys.passwordEncryptionAlgorithm] ?: return null
        return CloudPasswordVerifierMetadata(salt, verifier, kdf, params, algorithm)
    }

    private fun setNullable(preferences: androidx.datastore.preferences.core.MutablePreferences, key: Preferences.Key<String>, value: String?) {
        if (value == null) preferences.remove(key) else preferences[key] = value
    }

    private object Keys {
        val deviceId = stringPreferencesKey("sync.deviceId")
        val deviceName = stringPreferencesKey("sync.deviceName")
        val deviceCreatedAt = stringPreferencesKey("sync.deviceCreatedAt")
        val lastSuccessfulSyncAt = stringPreferencesKey("sync.googleDriveLastSyncAt")
        val lastAttemptedSyncAt = stringPreferencesKey("sync.googleDriveLastAttemptAt")
        val status = stringPreferencesKey("sync.status")
        val errorCategory = stringPreferencesKey("sync.lastErrorCategory")
        val errorMessage = stringPreferencesKey("sync.lastErrorMessage")
        val syncManifestFileId = stringPreferencesKey("sync.googleDriveManifestFileId")
        val backupManifestFileId = stringPreferencesKey("sync.googleDriveBackupManifestFileId")
        val passwordSalt = stringPreferencesKey("sync.cloudPassword.salt")
        val passwordVerifier = stringPreferencesKey("sync.cloudPassword.verifier")
        val passwordKdfAlgorithm = stringPreferencesKey("sync.cloudPassword.kdfAlgorithm")
        val passwordKdfParams = stringPreferencesKey("sync.cloudPassword.kdfParams")
        val passwordEncryptionAlgorithm = stringPreferencesKey("sync.cloudPassword.encryptionAlgorithm")
    }
}

private fun androidDeviceName(): String {
    val model = Build.MODEL?.trim().orEmpty()
    return model.ifEmpty { "Android device" }
}
