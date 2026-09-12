<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ColorRule extends Model
{
    public const FIELDS = ['subject', 'location', 'status', 'all_day'];

    public const OPERATORS = ['contains', 'not_contains', 'equals', 'starts_with', 'regex', 'is'];

    public const STATUSES = ['free', 'tentative', 'busy', 'oof', 'workingElsewhere', 'unknown'];

    protected $guarded = [];

    protected function casts(): array
    {
        return ['enabled' => 'boolean'];
    }

    /** Rules that every new user starts with. */
    public static function defaults(): array
    {
        return [
            ['name' => 'Vacation', 'field' => 'subject', 'operator' => 'regex', 'value' => 'vacation|ferie|holiday', 'color' => '#e5484d'],
            ['name' => 'Out of office', 'field' => 'status', 'operator' => 'is', 'value' => 'oof', 'color' => '#f76b15'],
            ['name' => 'Working elsewhere', 'field' => 'status', 'operator' => 'is', 'value' => 'workingElsewhere', 'color' => '#12a594'],
            ['name' => 'Tentative', 'field' => 'status', 'operator' => 'is', 'value' => 'tentative', 'color' => '#8b8d98'],
        ];
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'field' => $this->field,
            'operator' => $this->operator,
            'value' => $this->value,
            'color' => $this->color,
            'text_color' => $this->text_color,
            'enabled' => (bool) $this->enabled,
            'sort_order' => (int) $this->sort_order,
        ];
    }
}
