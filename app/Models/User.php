<?php

namespace App\Models;

use App\Support\Preferences;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;

class User extends Authenticatable
{
    /** Tokens and identity are written with forceFill() only, never from request input. */
    protected $fillable = ['entra_id', 'name', 'email', 'given_name', 'job_title', 'manager_entra_id', 'preferences', 'last_login_at', 'last_seen_at'];

    protected $hidden = ['access_token', 'refresh_token', 'remember_token'];

    protected function casts(): array
    {
        return [
            'access_token' => 'encrypted',
            'refresh_token' => 'encrypted',
            'token_expires_at' => 'datetime',
            'last_login_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'preferences' => 'array',
        ];
    }

    public function groups(): HasMany
    {
        return $this->hasMany(Group::class)->orderBy('sort_order')->orderBy('id');
    }

    public function colorRules(): HasMany
    {
        return $this->hasMany(ColorRule::class)->orderBy('sort_order')->orderBy('id');
    }

    /** Preferences merged with defaults. */
    public function prefs(): array
    {
        return Preferences::merge($this->preferences ?? []);
    }

    public function pref(string $key, mixed $default = null): mixed
    {
        return $this->prefs()[$key] ?? $default;
    }

    public function hasScope(string $scope): bool
    {
        $granted = preg_split('/\s+/', (string) $this->granted_scopes, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return in_array($scope, $granted, true);
    }
}
