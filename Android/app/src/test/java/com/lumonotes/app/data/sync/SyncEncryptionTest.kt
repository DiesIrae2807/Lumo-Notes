package com.lumonotes.app.data.sync

import com.lumonotes.app.domain.Folder
import com.lumonotes.app.domain.Note
import com.lumonotes.app.domain.Tag
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.MessageDigest
import java.util.Base64

class SyncEncryptionTest {
    private val password = "correct horse battery staple"
    private val preciseTimestamp = "2026-07-05T12:34:56.007Z"
    private val salt = ByteArray(16) { it.toByte() }
    private val nonce = ByteArray(24) { (it + 16).toByte() }

    @Test
    fun encryptsAndDecryptsSyncChangeRecordWithoutChangingPlaintext() {
        val record = record("note", "note-test", "upsert", false)
        val plaintext = SyncSerializer.changeRecordToJsonString(record)

        val encrypted = SyncEncryption.encryptWithParameters(password, plaintext, salt, nonce)
        val decrypted = SyncEncryption.decrypt(password, encrypted)
        val parsed = SyncEncryption.decryptChangeRecord(password, encrypted)

        assertEquals(plaintext, decrypted)
        assertEquals(record.changeId, parsed.changeId)
        assertEquals(preciseTimestamp, parsed.createdAt)
        assertEquals(preciseTimestamp, notePayload(parsed).getString("updatedAt"))
        assertEquals(16, Base64.getDecoder().decode(encrypted.salt).size)
        assertEquals(24, Base64.getDecoder().decode(encrypted.nonce).size)
        assertEquals(plaintext.toByteArray().size + 16, Base64.getDecoder().decode(encrypted.ciphertextBase64).size)
    }

    @Test
    fun wrongPasswordFailsBeforeDecrypting() {
        val encrypted = SyncEncryption.encryptWithParameters(
            password,
            SyncSerializer.changeRecordToJsonString(record("note", "note-test", "upsert", false)),
            salt,
            nonce,
        )

        val error = assertThrows(SyncEncryptionException::class.java) {
            SyncEncryption.decrypt("incorrect password", encrypted)
        }

        assertTrue(error.message.orEmpty().contains("password does not match"))
    }

    @Test
    fun corruptedCiphertextFailsChecksumValidation() {
        val encrypted = SyncEncryption.encryptWithParameters(password, "{\"value\":1}", salt, nonce)
        val ciphertext = Base64.getDecoder().decode(encrypted.ciphertextBase64).also { it[0] = (it[0].toInt() xor 1).toByte() }

        val error = assertThrows(SyncEncryptionException::class.java) {
            SyncEncryption.decrypt(password, encrypted.copy(ciphertextBase64 = Base64.getEncoder().encodeToString(ciphertext)))
        }

        assertTrue(error.message.orEmpty().contains("checksum"))
    }

    @Test
    fun corruptedCiphertextWithMatchingChecksumFailsAuthentication() {
        val encrypted = SyncEncryption.encryptWithParameters(password, "{\"value\":1}", salt, nonce)
        val ciphertext = Base64.getDecoder().decode(encrypted.ciphertextBase64).also { it[0] = (it[0].toInt() xor 1).toByte() }
        val corrupted = encrypted.copy(
            ciphertextBase64 = Base64.getEncoder().encodeToString(ciphertext),
            checksum = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(ciphertext)),
        )

        val error = assertThrows(SyncEncryptionException::class.java) {
            SyncEncryption.decrypt(password, corrupted)
        }

        assertTrue(error.message.orEmpty().contains("Could not decrypt"))
    }

    @Test
    fun encryptedEnvelopeJsonMatchesDesktopShapeAndAllowsMissingVerifier() {
        val encrypted = SyncEncryption.encryptWithParameters(password, "{}", salt, nonce)
        val json = SyncEncryption.toJson(encrypted)

        assertEquals("lumo-cloud-backup-v1", json.getString("format"))
        assertEquals("argon2id", json.getString("kdfAlgorithm"))
        assertEquals("m=19456,t=2,p=1", json.getString("kdfParams"))
        assertEquals("XChaCha20-Poly1305", json.getString("encryptionAlgorithm"))
        assertEquals(encrypted, SyncEncryption.fromJsonString(json.toString()))
        assertEquals("{}", SyncEncryption.decrypt(password, encrypted.copy(passwordVerifier = null)))
    }

    @Test
    fun matchesFixtureGeneratedByDesktopRustCryptoCrates() {
        val plaintext = """{"schemaVersion":1,"changeId":"note-note-test-20260705123456007-device-android","deviceId":"device-android","deviceName":"Android Phone","createdAt":"2026-07-05T12:34:56.007Z","entityType":"note","entityId":"note-test","operation":"upsert","payload":{"value":"desktop fixture"}}"""
        val fixture = EncryptedSyncPayload(
            salt = "AAECAwQFBgcICQoLDA0ODw==",
            passwordVerifier = "hOwlVYeq8kW0wNAUtZ83dVcnRc1N8kp6yqM/DfYU69E=",
            nonce = "EBESExQVFhcYGRobHB0eHyAhIiMkJSYn",
            ciphertextBase64 = "jhfOcJELY3k1nedc/DKnOixmtROJH9cDBU/W9PQoVoXMRl91vWr9iHqDMvmil2Ahew0gEcYEeodM/+EdMzSVJWd7yEptEEQXOS/BXhmapnhsukGIGOCHWvqw6iNfNkBoE1MB3Tw9vP38H0Q+VJQMpWBEfnJfTRMRNdf5g6l+6dOThq7STrUbaPi96SQnWmmfOQHEOVUQxcimbLSNADo64/vI0+DnFzGFk77p7d21OMnrfzJG0A732b04ex30IOBJr0J3J8zGvjDNxKpAkl5o/AEh1OjUUek/p5v7McRgWbRpJmCYWlQqGTvfG2kf7E5tpKMOkOLK7jrXZ2oM3EJ9SCijXQCDnSZC768CEzxIzGKPwJTi5sAU1jLTB7hlXShAypGJOQ+2",
            checksum = "JaaYSRLp0TWKrymVGu3KXSMKk8ClE0ESCEaWT6oAKqA=",
        )

        val androidEncrypted = SyncEncryption.encryptWithParameters(password, plaintext, salt, nonce)

        assertEquals(fixture, androidEncrypted)
        assertEquals(plaintext, SyncEncryption.decrypt(password, fixture))
        assertEquals(preciseTimestamp, JSONObject(SyncEncryption.decrypt(password, fixture)).getString("createdAt"))
    }

    @Test
    fun encryptsNoteCreateUpdateDeleteAndRestoreRecords() {
        val records = listOf(
            record("note", "note-created", "upsert", false),
            record("note", "note-updated", "upsert", false),
            record("note", "note-deleted", "delete", true),
            record("note", "note-restored", "upsert", false),
        )

        records.forEachIndexed { index, record ->
            val encrypted = SyncEncryption.encryptWithParameters(
                password,
                SyncSerializer.changeRecordToJsonString(record),
                salt,
                nonce.copyOf().also { it[23] = (it[23] + index).toByte() },
            )
            val restored = SyncEncryption.decryptChangeRecord(password, encrypted)
            assertEquals(record.operation, restored.operation)
            assertEquals(notePayload(record).getBoolean("isDeleted"), notePayload(restored).getBoolean("isDeleted"))
        }
    }

    @Test
    fun encryptsFolderAndTagRecords() {
        val records = listOf(
            SyncSerializer.folderChangeRecord(
                Folder("folder-projects", "Projects", "bg-slate-400", preciseTimestamp, preciseTimestamp),
                SyncDeviceMetadata("device-android", "Android Phone"),
                preciseTimestamp,
                "20260705123456007",
            ),
            SyncSerializer.tagChangeRecord(
                Tag("work", "work", preciseTimestamp, preciseTimestamp),
                SyncDeviceMetadata("device-android", "Android Phone"),
                preciseTimestamp,
                "20260705123456007",
            ),
        )

        records.forEach { record ->
            val encrypted = SyncEncryption.encryptChangeRecord(password, record)
            val restored = SyncEncryption.decryptChangeRecord(password, encrypted)
            assertEquals(record.entityType, restored.entityType)
            assertEquals(record.entityId, restored.entityId)
        }
    }

    private fun record(
        entityType: String,
        entityId: String,
        operation: String,
        isDeleted: Boolean,
    ): SyncChangeRecord = SyncChangeRecord(
        changeId = "$entityType-$entityId-20260705123456007-device-android",
        deviceId = "device-android",
        deviceName = "Android Phone",
        createdAt = preciseTimestamp,
        entityType = SyncEntityType(entityType),
        entityId = entityId,
        operation = SyncOperation(operation),
        payload = SyncPayload.Backup(
            LumoBackupSerializer.createPayload(
                notes = listOf(
                    Note(
                        id = entityId,
                        title = "Test",
                        content = "Body",
                        preview = "Body",
                        folderId = "uncategorized",
                        folderName = "Uncategorized",
                        tags = emptyList(),
                        isPinned = false,
                        isFavorite = false,
                        isDeleted = isDeleted,
                        isArchived = false,
                        isLocked = false,
                        encryptedContent = null,
                        encryptedPreview = null,
                        encryptionNonce = null,
                        lockedAt = null,
                        createdAt = preciseTimestamp,
                        updatedAt = preciseTimestamp,
                    ),
                ),
                folders = emptyList(),
                tags = emptyList(),
                exportedAt = preciseTimestamp,
            ),
        ),
    )

    private fun notePayload(record: SyncChangeRecord): JSONObject =
        SyncSerializer.changeRecordToJson(record)
            .getJSONObject("payload")
            .getJSONArray("notes")
            .getJSONObject(0)
}
