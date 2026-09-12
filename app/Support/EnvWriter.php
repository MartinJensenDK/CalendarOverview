<?php

namespace App\Support;

use RuntimeException;

/**
 * Rewrites keys in the .env file without touching comments or unknown keys.
 */
class EnvWriter
{
    public function __construct(private readonly string $path) {}

    public static function forApp(): self
    {
        return new self(base_path('.env'));
    }

    public function path(): string
    {
        return $this->path;
    }

    public function isWritable(): bool
    {
        if (is_file($this->path)) {
            return is_writable($this->path);
        }

        return is_writable(dirname($this->path));
    }

    /** @param array<string, string|int|bool|null> $values */
    public function write(array $values): void
    {
        if (! is_file($this->path)) {
            $example = dirname($this->path).'/.env.example';
            $seed = is_file($example) ? file_get_contents($example) : '';
            if (@file_put_contents($this->path, $seed) === false) {
                throw new RuntimeException("Cannot create {$this->path}");
            }
        }

        $content = file_get_contents($this->path);
        if ($content === false) {
            throw new RuntimeException("Cannot read {$this->path}");
        }

        foreach ($values as $key => $value) {
            $line = $key.'='.self::format($value);
            $pattern = '/^#?\s*'.preg_quote($key, '/').'=.*$/m';
            if (preg_match($pattern, $content)) {
                $content = preg_replace_callback($pattern, fn () => $line, $content, 1);
            } else {
                $content = rtrim($content, "\r\n")."\n".$line."\n";
            }
        }

        if (@file_put_contents($this->path, $content) === false) {
            throw new RuntimeException("Cannot write {$this->path}");
        }
    }

    public static function format(mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if ($value === null) {
            return '';
        }
        $value = (string) $value;
        if ($value === '' || preg_match('/^[A-Za-z0-9_.:\/\-+@]+$/', $value)) {
            return $value;
        }

        return '"'.str_replace(['\\', '"'], ['\\\\', '\\"'], $value).'"';
    }
}
