<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Group extends Model
{
    public const TYPE_MANUAL = 'manual';

    public const TYPE_ENTRA = 'entra';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'visible' => 'boolean',
            'members_synced_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(DirectoryUser::class, 'group_members', 'group_id', 'directory_user_id');
    }

    public function managers(): BelongsToMany
    {
        return $this->belongsToMany(DirectoryUser::class, 'group_managers', 'group_id', 'manager_directory_user_id');
    }
}
