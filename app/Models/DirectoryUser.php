<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DirectoryUser extends Model
{
    protected $guarded = [];

    protected $keyType = 'string';

    public $incrementing = false;

    protected function casts(): array
    {
        return [
            'account_enabled' => 'boolean',
            'has_photo' => 'boolean',
            'is_demo' => 'boolean',
            'photo_synced_at' => 'datetime',
            'synced_at' => 'datetime',
        ];
    }

    public function initials(): string
    {
        $parts = preg_split('/[\s\-]+/', trim($this->display_name)) ?: [];
        $first = mb_substr($parts[0] ?? '', 0, 1);
        $last = count($parts) > 1 ? mb_substr(end($parts), 0, 1) : '';

        return mb_strtoupper($first.$last) ?: '?';
    }

    /** Compact representation used by the API. */
    public function toSummary(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->display_name,
            'email' => $this->mail ?: $this->upn,
            'title' => $this->job_title,
            'department' => $this->department,
            'manager_id' => $this->manager_id,
            'initials' => $this->initials(),
            'has_photo' => (bool) $this->has_photo,
            'photo_url' => '/api/photos/'.rawurlencode($this->id).'?v='.($this->photo_synced_at?->getTimestamp() ?? 0),
            'is_demo' => (bool) $this->is_demo,
        ];
    }
}
