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

    public static function setupTokenFile(): string
    {
        return storage_path('app/setup-token.txt');
    }

    /**
     * The web wizard is unauthenticated, so it is unlocked with a token that only someone with
     * access to the server can read. Created on first use, removed once the setup completes.
     */
    public static function setupToken(): string
    {
        $file = self::setupTokenFile();
        $token = is_file($file) ? trim((string) file_get_contents($file)) : '';
        if ($token === '') {
            $dir = dirname($file);
            if (! is_dir($dir)) {
                mkdir($dir, 0775, true);
            }
            $token = bin2hex(random_bytes(20));
            file_put_contents($file, $token."\n");
            @chmod($file, 0640);
        }

        return $token;
    }

    public static function verifySetupToken(?string $candidate): bool
    {
        $candidate = trim((string) $candidate);

        return $candidate !== '' && hash_equals(self::setupToken(), $candidate);
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
        if (is_file(self::setupTokenFile())) {
            @unlink(self::setupTokenFile());
        }
    }
}
