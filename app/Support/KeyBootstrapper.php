<?php

namespace App\Support;

use Illuminate\Encryption\Encrypter;

/**
 * Generates APP_KEY on first boot when it is missing, so a fresh clone works
 * without running `php artisan key:generate` by hand.
 */
class KeyBootstrapper
{
    public static function ensureKey(): void
    {
        if (filled(config('app.key'))) {
            return;
        }
        $writer = EnvWriter::forApp();
        if (! $writer->isWritable()) {
            return;
        }
        $key = 'base64:'.base64_encode(Encrypter::generateKey(config('app.cipher', 'AES-256-CBC')));
        $writer->write(['APP_KEY' => $key]);
        config(['app.key' => $key]);
        $_ENV['APP_KEY'] = $key;
        putenv('APP_KEY='.$key);
    }
}
