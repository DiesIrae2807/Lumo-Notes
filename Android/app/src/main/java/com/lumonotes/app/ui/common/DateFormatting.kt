package com.lumonotes.app.ui.common

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val DisplayDateFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("MMM d, h:mm a").withZone(ZoneId.systemDefault())

fun displayDate(value: String): String =
    runCatching { DisplayDateFormatter.format(Instant.parse(value)) }.getOrDefault(value)
