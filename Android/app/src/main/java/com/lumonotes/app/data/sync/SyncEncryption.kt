package com.lumonotes.app.data.sync

import org.bouncycastle.crypto.InvalidCipherTextException
import org.bouncycastle.crypto.generators.Argon2BytesGenerator
import org.bouncycastle.crypto.modes.ChaCha20Poly1305
import org.bouncycastle.crypto.params.AEADParameters
import org.bouncycastle.crypto.params.Argon2Parameters
import org.bouncycastle.crypto.params.KeyParameter
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

data class EncryptedSyncPayload(
    val format: String = SyncEncryption.FORMAT,
    val kdfAlgorithm: String = SyncEncryption.KDF_ALGORITHM,
    val kdfParams: String = SyncEncryption.KDF_PARAMS,
    val encryptionAlgorithm: String = SyncEncryption.ENCRYPTION_ALGORITHM,
    val salt: String,
    val passwordVerifier: String?,
    val nonce: String,
    val ciphertextBase64: String,
    val checksum: String,
)

class SyncEncryptionException(message: String, cause: Throwable? = null) : Exception(message, cause)

object SyncEncryption {
    const val FORMAT = "lumo-cloud-backup-v1"
    const val KDF_ALGORITHM = "argon2id"
    const val KDF_PARAMS = "m=19456,t=2,p=1"
    const val ENCRYPTION_ALGORITHM = "XChaCha20-Poly1305"

    private const val ARGON2_MEMORY_KIB = 19_456
    private const val ARGON2_ITERATIONS = 2
    private const val ARGON2_PARALLELISM = 1
    private const val KEY_SIZE = 32
    private const val SALT_SIZE = 16
    private const val XNONCE_SIZE = 24
    private const val TAG_BITS = 128
    private val verifierPrefix = "lumo-notes-lock-verifier-v1".toByteArray(StandardCharsets.UTF_8)
    private val base64Encoder = Base64.getEncoder()
    private val base64Decoder = Base64.getDecoder()

    fun encryptChangeRecord(
        password: String,
        record: SyncChangeRecord,
        secureRandom: SecureRandom = SecureRandom(),
    ): EncryptedSyncPayload = encrypt(password, SyncSerializer.changeRecordToJsonString(record), secureRandom)

    fun decryptChangeRecord(password: String, payload: EncryptedSyncPayload): SyncChangeRecord =
        SyncSerializer.changeRecordFromJsonString(decrypt(password, payload))

    fun encrypt(
        password: String,
        plaintextJson: String,
        secureRandom: SecureRandom = SecureRandom(),
    ): EncryptedSyncPayload {
        val salt = ByteArray(SALT_SIZE).also(secureRandom::nextBytes)
        val nonce = ByteArray(XNONCE_SIZE).also(secureRandom::nextBytes)
        return encryptWithParameters(password, plaintextJson, salt, nonce)
    }

    internal fun encryptWithParameters(
        password: String,
        plaintextJson: String,
        salt: ByteArray,
        nonce: ByteArray,
    ): EncryptedSyncPayload {
        require(salt.size == SALT_SIZE) { "Salt must contain 16 bytes." }
        require(nonce.size == XNONCE_SIZE) { "Nonce must contain 24 bytes." }
        val key = deriveKey(password, salt)
        val ciphertext = xChaCha20Poly1305(true, key, nonce, plaintextJson.toByteArray(StandardCharsets.UTF_8))
        return EncryptedSyncPayload(
            salt = encode(salt),
            passwordVerifier = verifier(key),
            nonce = encode(nonce),
            ciphertextBase64 = encode(ciphertext),
            checksum = encode(sha256(ciphertext)),
        )
    }

    fun decrypt(password: String, payload: EncryptedSyncPayload): String {
        validateEnvelope(payload)
        val ciphertext = decode(payload.ciphertextBase64, "ciphertext")
        val expectedChecksum = decode(payload.checksum, "checksum")
        if (!MessageDigest.isEqual(sha256(ciphertext), expectedChecksum)) {
            throw SyncEncryptionException("Encrypted backup checksum does not match.")
        }
        val salt = decode(payload.salt, "salt")
        if (salt.size != SALT_SIZE) throw SyncEncryptionException("Invalid encryption salt length.")
        val nonce = decode(payload.nonce, "nonce")
        if (nonce.size != XNONCE_SIZE) throw SyncEncryptionException("Invalid encryption nonce length.")
        val key = deriveKey(password, salt)
        payload.passwordVerifier?.let { encodedVerifier ->
            val supplied = decode(encodedVerifier, "password verifier")
            if (!MessageDigest.isEqual(sha256(verifierPrefix + key), supplied)) {
                throw SyncEncryptionException("This password does not match the password used to create this backup.")
            }
        }
        val plaintext = try {
            xChaCha20Poly1305(false, key, nonce, ciphertext)
        } catch (error: InvalidCipherTextException) {
            throw SyncEncryptionException(
                "Could not decrypt payload. The password may be wrong or the data is corrupted.",
                error,
            )
        }
        return try {
            StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(java.nio.ByteBuffer.wrap(plaintext))
                .toString()
        } catch (error: java.nio.charset.CharacterCodingException) {
            throw SyncEncryptionException("Backup package is not valid UTF-8.", error)
        }
    }

    fun toJsonString(payload: EncryptedSyncPayload): String = toJson(payload).toString()

    fun toJson(payload: EncryptedSyncPayload): JSONObject = JSONObject()
        .put("format", payload.format)
        .put("kdfAlgorithm", payload.kdfAlgorithm)
        .put("kdfParams", payload.kdfParams)
        .put("encryptionAlgorithm", payload.encryptionAlgorithm)
        .put("salt", payload.salt)
        .put("passwordVerifier", payload.passwordVerifier ?: JSONObject.NULL)
        .put("nonce", payload.nonce)
        .put("ciphertextBase64", payload.ciphertextBase64)
        .put("checksum", payload.checksum)

    fun fromJsonString(value: String): EncryptedSyncPayload = fromJson(JSONObject(value))

    fun fromJson(json: JSONObject): EncryptedSyncPayload = EncryptedSyncPayload(
        format = json.getString("format"),
        kdfAlgorithm = json.getString("kdfAlgorithm"),
        kdfParams = json.getString("kdfParams"),
        encryptionAlgorithm = json.getString("encryptionAlgorithm"),
        salt = json.getString("salt"),
        passwordVerifier = if (json.isNull("passwordVerifier")) null else json.getString("passwordVerifier"),
        nonce = json.getString("nonce"),
        ciphertextBase64 = json.getString("ciphertextBase64"),
        checksum = json.getString("checksum"),
    )

    private fun validateEnvelope(payload: EncryptedSyncPayload) {
        if (payload.format != FORMAT) throw SyncEncryptionException("Unsupported encrypted backup format.")
        if (payload.kdfAlgorithm != KDF_ALGORITHM || payload.kdfParams != KDF_PARAMS) {
            throw SyncEncryptionException("Unsupported encrypted backup key derivation.")
        }
        if (payload.encryptionAlgorithm != ENCRYPTION_ALGORITHM) {
            throw SyncEncryptionException("Unsupported encrypted backup algorithm.")
        }
    }

    private fun deriveKey(password: String, salt: ByteArray): ByteArray {
        val parameters = Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
            .withVersion(Argon2Parameters.ARGON2_VERSION_13)
            .withMemoryAsKB(ARGON2_MEMORY_KIB)
            .withIterations(ARGON2_ITERATIONS)
            .withParallelism(ARGON2_PARALLELISM)
            .withSalt(salt)
            .build()
        return ByteArray(KEY_SIZE).also { output ->
            Argon2BytesGenerator().apply { init(parameters) }
                .generateBytes(password.toByteArray(StandardCharsets.UTF_8), output)
        }
    }

    private fun verifier(key: ByteArray): String = encode(sha256(verifierPrefix + key))

    private fun xChaCha20Poly1305(
        encrypting: Boolean,
        key: ByteArray,
        nonce: ByteArray,
        input: ByteArray,
    ): ByteArray {
        val subKey = hChaCha20(key, nonce.copyOfRange(0, 16))
        val ietfNonce = ByteArray(12).also { nonce.copyInto(it, destinationOffset = 4, startIndex = 16) }
        val cipher = ChaCha20Poly1305().apply {
            init(encrypting, AEADParameters(KeyParameter(subKey), TAG_BITS, ietfNonce, null))
        }
        val output = ByteArray(cipher.getOutputSize(input.size))
        val processed = cipher.processBytes(input, 0, input.size, output, 0)
        val final = cipher.doFinal(output, processed)
        return output.copyOf(processed + final)
    }

    private fun hChaCha20(key: ByteArray, nonce: ByteArray): ByteArray {
        val state = intArrayOf(
            0x61707865, 0x3320646e, 0x79622d32, 0x6b206574,
            littleEndianInt(key, 0), littleEndianInt(key, 4), littleEndianInt(key, 8), littleEndianInt(key, 12),
            littleEndianInt(key, 16), littleEndianInt(key, 20), littleEndianInt(key, 24), littleEndianInt(key, 28),
            littleEndianInt(nonce, 0), littleEndianInt(nonce, 4), littleEndianInt(nonce, 8), littleEndianInt(nonce, 12),
        )
        repeat(10) {
            quarterRound(state, 0, 4, 8, 12)
            quarterRound(state, 1, 5, 9, 13)
            quarterRound(state, 2, 6, 10, 14)
            quarterRound(state, 3, 7, 11, 15)
            quarterRound(state, 0, 5, 10, 15)
            quarterRound(state, 1, 6, 11, 12)
            quarterRound(state, 2, 7, 8, 13)
            quarterRound(state, 3, 4, 9, 14)
        }
        return ByteArray(32).also { output ->
            intArrayOf(state[0], state[1], state[2], state[3], state[12], state[13], state[14], state[15])
                .forEachIndexed { index, value -> writeLittleEndian(value, output, index * 4) }
        }
    }

    private fun quarterRound(state: IntArray, a: Int, b: Int, c: Int, d: Int) {
        state[a] += state[b]
        state[d] = Integer.rotateLeft(state[d] xor state[a], 16)
        state[c] += state[d]
        state[b] = Integer.rotateLeft(state[b] xor state[c], 12)
        state[a] += state[b]
        state[d] = Integer.rotateLeft(state[d] xor state[a], 8)
        state[c] += state[d]
        state[b] = Integer.rotateLeft(state[b] xor state[c], 7)
    }

    private fun littleEndianInt(bytes: ByteArray, offset: Int): Int =
        (bytes[offset].toInt() and 0xff) or
            ((bytes[offset + 1].toInt() and 0xff) shl 8) or
            ((bytes[offset + 2].toInt() and 0xff) shl 16) or
            ((bytes[offset + 3].toInt() and 0xff) shl 24)

    private fun writeLittleEndian(value: Int, output: ByteArray, offset: Int) {
        output[offset] = value.toByte()
        output[offset + 1] = (value ushr 8).toByte()
        output[offset + 2] = (value ushr 16).toByte()
        output[offset + 3] = (value ushr 24).toByte()
    }

    private fun sha256(value: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(value)

    private fun encode(value: ByteArray): String = base64Encoder.encodeToString(value)

    private fun decode(value: String, field: String): ByteArray = try {
        base64Decoder.decode(value)
    } catch (error: IllegalArgumentException) {
        throw SyncEncryptionException("Invalid $field base64.", error)
    }
}
