package com.rewardsplatform.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val RewardsColorScheme = lightColorScheme(
    primary = RewardsTokens.primary,
    secondary = RewardsTokens.accent,
    tertiary = RewardsTokens.success,
    error = RewardsTokens.danger,
    background = RewardsTokens.background,
    surface = RewardsTokens.surface,
    onPrimary = RewardsTokens.surface,
    onSecondary = RewardsTokens.surface,
    onBackground = RewardsTokens.text,
    onSurface = RewardsTokens.text,
)

@Composable
fun RewardsMarketplaceTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = RewardsColorScheme,
        content = content,
    )
}