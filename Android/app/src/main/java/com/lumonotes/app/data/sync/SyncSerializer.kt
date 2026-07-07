package com.lumonotes.app.data.sync

import com.lumonotes.app.domain.Folder
import com.lumonotes.app.domain.Note
import com.lumonotes.app.domain.Tag
import org.json.JSONArray
import org.json.JSONObject

object SyncSerializer {
    fun manifestFromJsonString(value: String): SyncManifest = manifestFromJson(JSONObject(value))

    fun manifestToJsonString(manifest: SyncManifest): String = manifestToJson(manifest).toString()

    fun manifestFromJson(json: JSONObject): SyncManifest {
        require(json.getString("appName") == "Lumo Notes") { "Unsupported sync manifest app." }
        require(json.getInt("manifestVersion") == 1) { "Unsupported sync manifest version." }
        return SyncManifest(
            appName = json.getString("appName"),
            manifestVersion = json.getInt("manifestVersion"),
            updatedAt = json.getString("updatedAt"),
            changes = json.getJSONArray("changes").mapObjects(::manifestEntryFromJson),
        )
    }

    fun manifestToJson(manifest: SyncManifest): JSONObject = JSONObject()
        .put("appName", manifest.appName)
        .put("manifestVersion", manifest.manifestVersion)
        .put("updatedAt", manifest.updatedAt)
        .put("changes", JSONArray(manifest.changes.map(::manifestEntryToJson)))

    fun changeRecordFromJsonString(value: String): SyncChangeRecord = changeRecordFromJson(JSONObject(value))

    fun changeRecordToJsonString(record: SyncChangeRecord): String = changeRecordToJson(record).toString()

    fun changeRecordFromJson(json: JSONObject): SyncChangeRecord {
        require(json.getInt("schemaVersion") == 1) { "Unsupported sync change record version." }
        val entityType = SyncEntityType(json.getString("entityType"))
        val payloadJson = json.getJSONObject("payload")
        return SyncChangeRecord(
            schemaVersion = json.getInt("schemaVersion"),
            changeId = json.getString("changeId"),
            deviceId = json.getString("deviceId"),
            deviceName = json.getString("deviceName"),
            createdAt = json.getString("createdAt"),
            entityType = entityType,
            entityId = json.getString("entityId"),
            operation = SyncOperation(json.getString("operation")),
            payload = payloadFromJson(entityType, payloadJson),
        )
    }

    fun changeRecordToJson(record: SyncChangeRecord): JSONObject = JSONObject()
        .put("schemaVersion", record.schemaVersion)
        .put("changeId", record.changeId)
        .put("deviceId", record.deviceId)
        .put("deviceName", record.deviceName)
        .put("createdAt", record.createdAt)
        .put("entityType", record.entityType.value)
        .put("entityId", record.entityId)
        .put("operation", record.operation.value)
        .put("payload", payloadToJson(record.payload))

    fun changeFileName(changeId: String): String =
        "${SyncContractConstants.changeFilePrefix}${filenameSafe(changeId)}${SyncContractConstants.changeFileSuffix}"

    fun changeId(entityType: SyncEntityType, entityId: String, stamp: String, deviceId: String): String =
        "${entityType.value}-${filenameSafe(entityId)}-${stamp.replace(Regex("[^0-9]"), "")}-$deviceId"

    fun noteChangeRecord(
        note: Note,
        folders: List<Folder>,
        tags: List<Tag>,
        device: SyncDeviceMetadata,
    ): SyncChangeRecord {
        val payload = LumoBackupSerializer.createPayload(
            notes = listOf(note),
            folders = folders.filter { it.id == note.folderId },
            tags = tags.filter { tag -> note.tags.any { it.equals(tag.name, ignoreCase = true) } },
            exportedAt = note.updatedAt,
        )
        return SyncChangeRecord(
            changeId = changeId(SyncEntityType.Note, note.id, note.updatedAt, device.deviceId),
            deviceId = device.deviceId,
            deviceName = device.deviceName,
            createdAt = note.updatedAt,
            entityType = SyncEntityType.Note,
            entityId = note.id,
            operation = if (note.isDeleted) SyncOperation.Delete else SyncOperation.Upsert,
            payload = SyncPayload.Backup(payload),
        )
    }

    fun folderChangeRecord(
        folder: Folder,
        device: SyncDeviceMetadata,
        createdAt: String,
        stamp: String,
    ): SyncChangeRecord {
        val payload = LumoBackupPayload(
            exportedAt = createdAt,
            notes = emptyList(),
            folders = listOf(folder),
            tags = emptyList(),
            noteTags = emptyList(),
        )
        return SyncChangeRecord(
            changeId = changeId(SyncEntityType.Folder, folder.id, stamp, device.deviceId),
            deviceId = device.deviceId,
            deviceName = device.deviceName,
            createdAt = createdAt,
            entityType = SyncEntityType.Folder,
            entityId = folder.id,
            operation = SyncOperation.Upsert,
            payload = SyncPayload.Backup(payload),
        )
    }

    fun tagChangeRecord(
        tag: Tag,
        device: SyncDeviceMetadata,
        createdAt: String,
        stamp: String,
    ): SyncChangeRecord {
        val payload = LumoBackupPayload(
            exportedAt = createdAt,
            notes = emptyList(),
            folders = emptyList(),
            tags = listOf(tag.name),
            noteTags = emptyList(),
        )
        return SyncChangeRecord(
            changeId = changeId(SyncEntityType.Tag, tag.name, stamp, device.deviceId),
            deviceId = device.deviceId,
            deviceName = device.deviceName,
            createdAt = createdAt,
            entityType = SyncEntityType.Tag,
            entityId = tag.name,
            operation = SyncOperation.Upsert,
            payload = SyncPayload.Backup(payload),
        )
    }

    private fun manifestEntryFromJson(json: JSONObject): SyncManifestEntry = SyncManifestEntry(
        changeId = json.getString("changeId"),
        createdAt = json.getString("createdAt"),
        deviceId = json.getString("deviceId"),
        deviceName = json.getString("deviceName"),
        entityType = SyncEntityType(json.getString("entityType")),
        entityId = json.getString("entityId"),
        operation = SyncOperation(json.getString("operation")),
        fileId = json.getString("fileId"),
        fileName = json.getString("fileName"),
    )

    private fun manifestEntryToJson(entry: SyncManifestEntry): JSONObject = JSONObject()
        .put("changeId", entry.changeId)
        .put("createdAt", entry.createdAt)
        .put("deviceId", entry.deviceId)
        .put("deviceName", entry.deviceName)
        .put("entityType", entry.entityType.value)
        .put("entityId", entry.entityId)
        .put("operation", entry.operation.value)
        .put("fileId", entry.fileId)
        .put("fileName", entry.fileName)

    private fun payloadFromJson(entityType: SyncEntityType, json: JSONObject): SyncPayload =
        when (entityType) {
            SyncEntityType.Note, SyncEntityType.Folder, SyncEntityType.Tag ->
                SyncPayload.Backup(LumoBackupSerializer.fromJson(json).payload)
            SyncEntityType.ConflictResolution ->
                SyncPayload.ConflictResolution(conflictResolutionFromJson(json))
            else -> SyncPayload.RawJson(json)
        }

    private fun payloadToJson(payload: SyncPayload): JSONObject =
        when (payload) {
            is SyncPayload.Backup -> LumoBackupSerializer.toJson(payload.backup)
            is SyncPayload.ConflictResolution -> conflictResolutionToJson(payload.resolution)
            is SyncPayload.RawJson -> JSONObject(payload.json.toString())
        }

    private fun conflictResolutionFromJson(json: JSONObject): SyncConflictResolutionPayload =
        SyncConflictResolutionPayload(
            conflictId = json.getString("conflictId"),
            originalNoteId = json.getString("originalNoteId"),
            sourceRemoteChangeId = json.getString("sourceRemoteChangeId"),
            selectedResolution = json.getString("selectedResolution"),
            resultingNoteId = json.nullableString("resultingNoteId"),
            resolvingDeviceId = json.getString("resolvingDeviceId"),
            resolvedAt = json.getString("resolvedAt"),
            finalNotePayload = if (json.isNull("finalNotePayload")) {
                null
            } else {
                LumoBackupSerializer.fromJson(json.getJSONObject("finalNotePayload")).payload
            },
        )

    private fun conflictResolutionToJson(payload: SyncConflictResolutionPayload): JSONObject = JSONObject()
        .put("conflictId", payload.conflictId)
        .put("originalNoteId", payload.originalNoteId)
        .put("sourceRemoteChangeId", payload.sourceRemoteChangeId)
        .put("selectedResolution", payload.selectedResolution)
        .put("resultingNoteId", payload.resultingNoteId ?: JSONObject.NULL)
        .put("resolvingDeviceId", payload.resolvingDeviceId)
        .put("resolvedAt", payload.resolvedAt)
        .put("finalNotePayload", payload.finalNotePayload?.let(LumoBackupSerializer::toJson) ?: JSONObject.NULL)

    private fun filenameSafe(value: String): String = value.replace(Regex("[^a-zA-Z0-9_-]"), "-")

    private fun JSONObject.nullableString(name: String): String? = if (isNull(name)) null else getString(name)

    private fun JSONArray.mapObjects(mapper: (JSONObject) -> SyncManifestEntry): List<SyncManifestEntry> = buildList {
        for (index in 0 until length()) add(mapper(getJSONObject(index)))
    }
}
