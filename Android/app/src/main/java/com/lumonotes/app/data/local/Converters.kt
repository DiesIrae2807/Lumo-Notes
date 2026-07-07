package com.lumonotes.app.data.local

import androidx.room.TypeConverter
import org.json.JSONArray

class Converters {
    @TypeConverter
    fun tagsToJson(tags: List<String>): String {
        val array = JSONArray()
        tags.forEach(array::put)
        return array.toString()
    }

    @TypeConverter
    fun jsonToTags(value: String): List<String> {
        if (value.isBlank()) return emptyList()
        val array = JSONArray(value)
        return buildList {
            for (index in 0 until array.length()) {
                add(array.getString(index))
            }
        }
    }
}
