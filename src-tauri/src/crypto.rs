use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};

pub const KDF_ALGORITHM: &str = "argon2id";
pub const ENCRYPTION_ALGORITHM: &str = "XChaCha20-Poly1305";
pub const KDF_PARAMS: &str = "m=19456,t=2,p=1";

fn argon2() -> Result<Argon2<'static>, String> {
    let params = Params::new(19_456, 2, 1, Some(32)).map_err(|error| error.to_string())?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

pub fn random_base64(length: usize) -> String {
    let mut bytes = vec![0_u8; length];
    OsRng.fill_bytes(&mut bytes);
    STANDARD.encode(bytes)
}

pub fn derive_key(password: &str, salt_b64: &str) -> Result<[u8; 32], String> {
    let salt = STANDARD.decode(salt_b64).map_err(|_| "Invalid lock salt.".to_string())?;
    let mut key = [0_u8; 32];
    argon2()?
        .hash_password_into(password.as_bytes(), &salt, &mut key)
        .map_err(|error| error.to_string())?;
    Ok(key)
}

pub fn verifier_for_key(key: &[u8; 32]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"lumo-notes-lock-verifier-v1");
    hasher.update(key);
    STANDARD.encode(hasher.finalize())
}

pub fn encrypt_string(key: &[u8; 32], plaintext: &str) -> Result<(String, String), String> {
    let (nonce, ciphertext) = encrypt_bytes(key, plaintext.as_bytes())?;
    Ok((nonce, STANDARD.encode(ciphertext)))
}

pub fn decrypt_string(key: &[u8; 32], nonce_b64: &str, ciphertext_b64: &str) -> Result<String, String> {
    let ciphertext = STANDARD
        .decode(ciphertext_b64)
        .map_err(|_| "Invalid encrypted note payload.".to_string())?;
    let plaintext = decrypt_bytes(key, nonce_b64, &ciphertext)?;
    String::from_utf8(plaintext).map_err(|_| "Decrypted note is not valid text.".to_string())
}

pub fn encrypt_bytes(key: &[u8; 32], plaintext: &[u8]) -> Result<(String, Vec<u8>), String> {
    let mut nonce = [0_u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let cipher = XChaCha20Poly1305::new(key.into());
    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce), plaintext)
        .map_err(|_| "Could not encrypt payload.".to_string())?;
    Ok((STANDARD.encode(nonce), ciphertext))
}

pub fn decrypt_bytes(key: &[u8; 32], nonce_b64: &str, ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    let nonce = STANDARD.decode(nonce_b64).map_err(|_| "Invalid encryption nonce.".to_string())?;
    if nonce.len() != 24 {
        return Err("Invalid encryption nonce length.".to_string());
    }
    let cipher = XChaCha20Poly1305::new(key.into());
    cipher
        .decrypt(XNonce::from_slice(&nonce), ciphertext)
        .map_err(|_| "Could not decrypt payload. The password may be wrong or the data is corrupted.".to_string())
}

pub fn base64_encode(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

pub fn base64_decode(value: &str) -> Result<Vec<u8>, String> {
    STANDARD.decode(value).map_err(|_| "Invalid base64 payload.".to_string())
}
