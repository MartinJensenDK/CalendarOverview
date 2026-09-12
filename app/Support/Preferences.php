<?php

namespace App\Support;

/**
 * Per-user preferences stored as JSON on the users table.
 * Everything here is remembered across devices.
 */
class Preferences
{
    public const THEMES = ['system', 'light', 'dark'];

    public const LOCALES = ['en', 'da'];

    public const ROW_HEIGHTS = ['sm', 'md', 'lg'];

    public const PAGE_SIZES = [25, 50, 100, 200];

    public const DAY_OPTIONS = [1, 3, 5, 7, 10, 14, 21, 31];

    /** Keys shown on the Settings page; only these are touched by "Reset all settings". */
    public const SETTINGS_PAGE = ['theme', 'locale', 'row_height', 'days', 'page_size', 'work_start', 'work_end', 'show_weekends', 'mini_months', 'show_week_numbers', 'find_time_enabled', 'demo_enabled'];

    public static function defaults(): array
    {
        return [
            'theme' => 'system',
            'locale' => 'en',
            'days' => 7,
            'row_height' => 'md',
            'page_size' => 50,
            'show_weekends' => true,
            'work_start' => '08:00',
            'work_end' => '17:00',
            'heatmap_slot' => 30,
            'demo_enabled' => false,
            'my_team_visible' => true,
            'demo_visible' => true,
            'menu_collapsed' => false,
            'mini_months' => 1,
            'show_week_numbers' => false,
            'find_time_enabled' => true,
            'heatmap_duration' => 60,
            'heatmap_work_only' => true,
            'heatmap_show_weekends' => true,
            'heatmap_days' => 7,
        ];
    }

    public static function merge(array $stored): array
    {
        $defaults = self::defaults();

        return array_merge($defaults, array_intersect_key($stored, $defaults));
    }

    /** Validation rules for PUT /api/settings (all keys optional). */
    public static function rules(): array
    {
        return [
            'theme' => ['sometimes', 'in:'.implode(',', self::THEMES)],
            'locale' => ['sometimes', 'in:'.implode(',', self::LOCALES)],
            'days' => ['sometimes', 'integer', 'min:1', 'max:31'],
            'row_height' => ['sometimes', 'in:'.implode(',', self::ROW_HEIGHTS)],
            'page_size' => ['sometimes', 'integer', 'in:'.implode(',', self::PAGE_SIZES)],
            'show_weekends' => ['sometimes', 'boolean'],
            'work_start' => ['sometimes', 'date_format:H:i'],
            'work_end' => ['sometimes', 'date_format:H:i'],
            'heatmap_slot' => ['sometimes', 'integer', 'in:15,30,60'],
            'demo_enabled' => ['sometimes', 'boolean'],
            'my_team_visible' => ['sometimes', 'boolean'],
            'demo_visible' => ['sometimes', 'boolean'],
            'menu_collapsed' => ['sometimes', 'boolean'],
            'mini_months' => ['sometimes', 'integer', 'in:1,2'],
            'show_week_numbers' => ['sometimes', 'boolean'],
            'find_time_enabled' => ['sometimes', 'boolean'],
            'heatmap_duration' => ['sometimes', 'integer', 'in:30,60,90,120'],
            'heatmap_work_only' => ['sometimes', 'boolean'],
            'heatmap_show_weekends' => ['sometimes', 'boolean'],
            'heatmap_days' => ['sometimes', 'integer', 'min:1', 'max:366'],
        ];
    }
}
