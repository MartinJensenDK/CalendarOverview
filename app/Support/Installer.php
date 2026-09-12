<?php

namespace App\Support;

/**
 * Knows whether the first-run setup has been completed.
 */
class Installer
{
    public static function lockFile(): string
    {
        return storage_path('app/installed.json');
    }

    public static function isInstalled(): bool
    {
        return is_file(self::lockFile());
    }

    public static function markInstalled(): void
    {
        $dir = dirname(self::lockFile());
        if (! is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        file_put_contents(self::lockFile(), json_encode([
            'installed_at' => now()->toIso8601String(),
            'version' => app()->version(),
        ], JSON_PRETTY_PRINT));
    }
}
