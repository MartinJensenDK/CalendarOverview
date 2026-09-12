<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class SyncState extends Model
{
    public $timestamps = false;

    protected $primaryKey = 'key';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $guarded = [];

    public static function get(string $key, mixed $default = null): mixed
    {
        $row = static::find($key);

        return $row?->value ?? $default;
    }

    public static function put(string $key, mixed $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value, 'updated_at' => Carbon::now()]);
    }

    public static function timestamp(string $key): ?Carbon
    {
        $value = static::get($key);

        return $value ? Carbon::parse($value) : null;
    }

    public static function touchKey(string $key): void
    {
        static::put($key, Carbon::now()->toIso8601String());
    }
}
