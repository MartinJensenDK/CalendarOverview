<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Microsoft Entra ID application registration (delegated permissions)
    |--------------------------------------------------------------------------
    */
    'tenant_id' => env('MS_TENANT_ID', ''),
    'client_id' => env('MS_CLIENT_ID', ''),
    'client_secret' => env('MS_CLIENT_SECRET', ''),
    'allowed_domains' => array_values(array_filter(array_map('trim', explode(',', (string) env('MS_ALLOWED_DOMAINS', ''))))),

    'authority' => 'https://login.microsoftonline.com',
    'graph' => 'https://graph.microsoft.com/v1.0',

    // Delegated, read-only scopes. User.Read.All and GroupMember.Read.All need admin consent.
    'scopes' => [
        'openid', 'profile', 'email', 'offline_access',
        'User.Read', 'User.ReadBasic.All', 'User.Read.All',
        'GroupMember.Read.All', 'Calendars.Read',
    ],

    /*
    |--------------------------------------------------------------------------
    | Cache lifetimes
    |--------------------------------------------------------------------------
    */
    'schedule_ttl_minutes' => (int) env('CALENDAR_SCHEDULE_TTL_MINUTES', 10),
    'directory_sync_hours' => (int) env('CALENDAR_DIRECTORY_SYNC_HOURS', 24),
    'photo_sync_days' => (int) env('CALENDAR_PHOTO_SYNC_DAYS', 7),
    'group_sync_hours' => (int) env('CALENDAR_GROUP_SYNC_HOURS', 24),

    // Maximum days per overview / availability request. Graph's getSchedule takes 62 days per call;
    // longer ranges are split into several calls automatically.
    'max_days' => 366,
    'graph_window_days' => 62,

    'demo_user_count' => 150,

    'version' => '1.3.4',
];
