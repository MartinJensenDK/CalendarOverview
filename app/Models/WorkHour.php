<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WorkHour extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'start_utc' => 'datetime',
            'end_utc' => 'datetime',
        ];
    }
}
