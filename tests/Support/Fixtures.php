<?php

namespace Tests\Support;

use App\Models\ColorRule;
use App\Models\DirectoryUser;
use App\Models\SyncState;
use App\Models\User;
use Illuminate\Support\Carbon;

class Fixtures
{
    public static function user(array $attributes = []): User
    {
        $user = User::create(array_merge([
            'entra_id' => 'me-0001',
            'name' => 'Test Person',
            'email' => 'test@example.com',
            'manager_entra_id' => 'mgr-0001',
            'access_token' => 'access-token',
            'refresh_token' => 'refresh-token',
            'token_expires_at' => Carbon::now()->addHour(),
            'granted_scopes' => 'User.Read Calendars.Read',
        ], $attributes));
        foreach (ColorRule::defaults() as $i => $rule) {
            $user->colorRules()->create($rule + ['sort_order' => $i, 'enabled' => true]);
        }
        self::directory($user->entra_id, $user->name, $user->email, $user->manager_entra_id);

        return $user;
    }

    public static function directory(string $id, string $name, string $mail, ?string $managerId = null, array $extra = []): DirectoryUser
    {
        return DirectoryUser::updateOrCreate(['id' => $id], array_merge([
            'display_name' => $name,
            'mail' => $mail,
            'upn' => $mail,
            'manager_id' => $managerId,
            'account_enabled' => true,
            'is_demo' => false,
            'synced_at' => Carbon::now(),
        ], $extra));
    }

    public static function team(): void
    {
        self::directory('mgr-0001', 'Mona Manager', 'mona@example.com', null);
        self::directory('peer-0001', 'Peter Peer', 'peter@example.com', 'mgr-0001');
        self::directory('peer-0002', 'Paula Peer', 'paula@example.com', 'mgr-0001');
        self::directory('other-0001', 'Otto Other', 'otto@example.com', 'mgr-0002');
        SyncState::put('directory_has_managers', '1');
        SyncState::touchKey('directory_synced_at');
    }

    public static function scheduleResponse(array $schedules): array
    {
        return ['value' => array_map(fn ($mail, $items) => [
            'scheduleId' => $mail,
            'availabilityView' => '',
            'scheduleItems' => $items,
        ], array_keys($schedules), $schedules)];
    }

    public static function item(string $start, string $end, string $status = 'busy', ?string $subject = null, string $tz = 'Europe/Copenhagen'): array
    {
        return array_filter([
            'status' => $status,
            'subject' => $subject,
            'start' => ['dateTime' => $start.'.0000000', 'timeZone' => $tz],
            'end' => ['dateTime' => $end.'.0000000', 'timeZone' => $tz],
        ], fn ($v) => $v !== null);
    }
}
