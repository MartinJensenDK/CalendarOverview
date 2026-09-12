<?php

namespace Tests\Feature;

use App\Models\Group;
use App\Services\PhotoSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\Fixtures;
use Tests\TestCase;

class ApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_me_returns_menu_with_my_team(): void
    {
        $user = Fixtures::user();
        Fixtures::team();

        $data = $this->actingAs($user)->getJson('/api/me')->assertOk()->json();
        $this->assertSame('me-0001', $data['user']['id']);
        $this->assertSame('my_team', $data['menu'][0]['id']);
        $names = array_column($data['menu'][0]['members'], 'name');
        $this->assertSame(['Test Person', 'Paula Peer', 'Peter Peer'], $names);
        $this->assertCount(4, $data['color_rules']);
        $this->assertSame(7, $data['preferences']['days']);
    }

    public function test_settings_are_saved_and_validated(): void
    {
        $user = Fixtures::user();
        $this->actingAs($user)->putJson('/api/settings', ['theme' => 'dark', 'locale' => 'da', 'days' => 14, 'row_height' => 'lg'])->assertOk()
            ->assertJsonPath('preferences.theme', 'dark')->assertJsonPath('preferences.days', 14);
        $this->assertSame('da', $user->fresh()->pref('locale'));
        $this->actingAs($user)->putJson('/api/settings', ['days' => 400])->assertStatus(422);
        $this->actingAs($user)->putJson('/api/settings', ['theme' => 'blue'])->assertStatus(422);
    }

    public function test_reset_only_touches_settings_page_preferences(): void
    {
        $user = Fixtures::user();
        $this->actingAs($user)->putJson('/api/settings', ['theme' => 'dark', 'days' => 14, 'my_team_visible' => false, 'menu_collapsed' => true, 'demo_enabled' => true])->assertOk();
        $this->actingAs($user)->postJson('/api/color-rules', ['name' => 'Keep me', 'field' => 'subject', 'operator' => 'contains', 'value' => 'x', 'color' => '#123456'])->assertCreated();

        $prefs = $this->actingAs($user)->postJson('/api/settings/reset')->assertOk()->json('preferences');
        $this->assertSame('system', $prefs['theme']);
        $this->assertSame(7, $prefs['days']);
        $this->assertFalse($prefs['demo_enabled']);
        $this->assertFalse($prefs['my_team_visible']);
        $this->assertTrue($prefs['menu_collapsed']);
        $this->assertSame(5, $user->colorRules()->count());
    }

    public function test_enabling_demo_seeds_150_users_and_shows_all_at_once(): void
    {
        $user = Fixtures::user();
        $this->actingAs($user)->putJson('/api/settings', ['demo_enabled' => true])->assertOk();
        $this->assertDatabaseCount('directory_users', 151);

        $data = $this->actingAs($user)->getJson('/api/overview?from=2026-09-14&days=7&tz=Europe/Copenhagen')->assertOk()->json();
        $this->assertSame(151, $data['total']); // me + 150 demo users
        $this->assertCount(151, $data['users']); // no paging: everyone is on one scrollable page
        $this->assertCount(7, $data['days']);
        $this->assertArrayNotHasKey('per_page', $data);
        $demoRow = collect($data['users'])->first(fn ($u) => $u['is_demo']);
        $this->assertNotEmpty($demoRow['items']);
        $first = $demoRow['items'][0];
        $this->assertArrayHasKey('st', $first);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $first['s']);
    }

    public function test_signed_in_user_is_always_first_in_overview(): void
    {
        $user = Fixtures::user();
        Fixtures::team();
        $this->actingAs($user)->putJson('/api/settings', ['my_team_visible' => false]);
        $this->actingAs($user)->postJson('/api/groups', ['name' => 'Others', 'type' => 'manual', 'members' => ['other-0001', 'peer-0002']])->assertCreated();

        $names = array_column($this->actingAs($user)->getJson('/api/overview?from=2026-09-14&days=1')->assertOk()->json('users'), 'name');
        $this->assertSame(['Test Person', 'Otto Other', 'Paula Peer'], $names);

        // Even with every group hidden the user's own row remains.
        $this->actingAs($user)->putJson('/api/settings', ['demo_enabled' => true, 'demo_visible' => false]);
        $group = $user->groups()->first();
        $this->actingAs($user)->postJson("/api/groups/{$group->id}/toggle", ['visible' => false]);
        $data = $this->actingAs($user)->getJson('/api/overview?from=2026-09-14&days=1')->assertOk()->json();
        $this->assertSame(1, $data['total']);
        $this->assertTrue($data['users'][0]['is_me']);
    }

    public function test_menu_order_can_move_built_in_groups(): void
    {
        $user = Fixtures::user();
        Fixtures::team();
        $group = $this->actingAs($user)->postJson('/api/groups', ['name' => 'Others', 'type' => 'manual', 'members' => ['other-0001']])->assertCreated()->json('group');

        $menu = $this->actingAs($user)->postJson('/api/groups/reorder', ['ids' => [(string) $group['id'], 'my_team']])->assertOk()->json('menu');
        $this->assertSame([$group['id'], 'my_team'], array_column($menu, 'id'));

        $names = array_column($this->actingAs($user)->getJson('/api/overview?from=2026-09-14&days=1')->json('users'), 'name');
        $this->assertSame(['Test Person', 'Otto Other', 'Paula Peer', 'Peter Peer'], $names);
    }

    public function test_user_in_several_groups_appears_once(): void
    {
        $user = Fixtures::user();
        Fixtures::team();
        $this->actingAs($user)->postJson('/api/groups', ['name' => 'A', 'type' => 'manual', 'members' => ['peer-0001', 'other-0001']])->assertCreated();
        $this->actingAs($user)->postJson('/api/groups', ['name' => 'B', 'type' => 'manual', 'members' => ['peer-0001', 'me-0001'], 'managers' => ['mgr-0001']])->assertCreated();

        $data = $this->actingAs($user)->getJson('/api/overview?from=2026-09-14&days=1')->assertOk()->json();
        $ids = array_column($data['users'], 'id');
        $this->assertSame($ids, array_values(array_unique($ids)));
        $this->assertSame(4, $data['total']);
        $this->assertSame('me-0001', $ids[0]);
    }

    public function test_demo_schedule_is_deterministic(): void
    {
        $user = Fixtures::user();
        $this->actingAs($user)->putJson('/api/settings', ['demo_enabled' => true, 'my_team_visible' => false]);
        $a = $this->actingAs($user)->getJson('/api/overview?from=2026-10-05&days=5')->json('users.0.items');
        $b = $this->actingAs($user)->getJson('/api/overview?from=2026-10-05&days=5')->json('users.0.items');
        $this->assertSame($a, $b);
    }

    public function test_groups_crud_with_manager_based_members(): void
    {
        $user = Fixtures::user();
        Fixtures::team();

        $created = $this->actingAs($user)->postJson('/api/groups', [
            'name' => 'Sales', 'type' => 'manual', 'members' => ['other-0001'], 'managers' => ['mgr-0001'],
        ])->assertCreated()->json('group');
        $this->assertSame(['Test Person', 'Otto Other', 'Paula Peer', 'Peter Peer'], array_column($created['members'], 'name'));

        $groupId = $created['id'];
        $this->actingAs($user)->postJson("/api/groups/{$groupId}/toggle")->assertOk()->assertJsonPath('group.visible', false);
        $this->assertFalse(Group::find($groupId)->visible);

        $this->actingAs($user)->putJson("/api/groups/{$groupId}", ['name' => 'Sales EU', 'type' => 'manual', 'members' => [], 'managers' => []])->assertOk()
            ->assertJsonPath('group.name', 'Sales EU')->assertJsonPath('group.members', []);

        $this->actingAs($user)->postJson('/api/groups', ['name' => '', 'type' => 'manual'])->assertStatus(422);
        $this->actingAs($user)->postJson('/api/groups', ['name' => 'X', 'type' => 'entra'])->assertStatus(422);

        $other = Fixtures::user(['entra_id' => 'other-9', 'email' => 'o@example.com']);
        $this->actingAs($other)->deleteJson("/api/groups/{$groupId}")->assertNotFound();
        $this->actingAs($user)->deleteJson("/api/groups/{$groupId}")->assertOk();
        $this->assertDatabaseMissing('groups', ['id' => $groupId]);
    }

    public function test_entra_group_members_are_synced_from_graph(): void
    {
        $user = Fixtures::user();
        Fixtures::team();
        Http::fake([
            'graph.microsoft.com/v1.0/groups/g-1/transitiveMembers/*' => Http::response(['value' => [['id' => 'peer-0001'], ['id' => 'other-0001'], ['id' => 'unknown-1']]]),
        ]);

        $group = $this->actingAs($user)->postJson('/api/groups', ['name' => 'Board', 'type' => 'entra', 'entra_group_id' => 'g-1', 'entra_group_name' => 'Board'])
            ->assertCreated()->json('group');
        $this->assertSame(['Otto Other', 'Peter Peer'], array_column($group['members'], 'name'));
        $this->assertNotNull($group['members_synced_at']);
    }

    public function test_color_rules_crud_and_validation(): void
    {
        $user = Fixtures::user();
        $rules = $this->actingAs($user)->postJson('/api/color-rules', ['name' => 'Doctor', 'field' => 'subject', 'operator' => 'contains', 'value' => 'doctor', 'color' => '#123456'])
            ->assertCreated()->json('color_rules');
        $this->assertCount(5, $rules);
        $this->assertSame('Doctor', end($rules)['name']);

        $this->actingAs($user)->postJson('/api/color-rules', ['name' => 'Bad', 'field' => 'subject', 'operator' => 'regex', 'value' => '(', 'color' => '#123456'])->assertStatus(422);
        $this->actingAs($user)->postJson('/api/color-rules', ['name' => 'Bad', 'field' => 'status', 'operator' => 'is', 'value' => 'nope', 'color' => '#123456'])->assertStatus(422);
        $this->actingAs($user)->postJson('/api/color-rules', ['name' => 'Bad', 'field' => 'subject', 'operator' => 'contains', 'value' => 'x', 'color' => 'red'])->assertStatus(422);

        $ids = array_reverse(array_column($rules, 'id'));
        $reordered = $this->actingAs($user)->postJson('/api/color-rules/reorder', ['ids' => $ids])->assertOk()->json('color_rules');
        $this->assertSame('Doctor', $reordered[0]['name']);

        $this->actingAs($user)->postJson('/api/color-rules/reset')->assertOk()->assertJsonCount(4, 'color_rules');
    }

    public function test_overview_fetches_schedules_from_graph_and_caches_them(): void
    {
        $user = Fixtures::user();
        Fixtures::team();
        Http::fake([
            'graph.microsoft.com/v1.0/me/calendar/getSchedule' => Http::response(Fixtures::scheduleResponse([
                'peter@example.com' => [Fixtures::item('2026-09-14T09:00:00', '2026-09-14T10:30:00', 'busy', 'Team sync')],
                'paula@example.com' => [Fixtures::item('2026-09-15T00:00:00', '2026-09-16T00:00:00', 'oof', 'Vacation')],
                'test@example.com' => [],
            ])),
            'graph.microsoft.com/v1.0/me/calendarView*' => Http::response(['value' => [[
                'subject' => 'Secret', 'showAs' => 'busy', 'isAllDay' => false, 'sensitivity' => 'private',
                'start' => ['dateTime' => '2026-09-14T13:00:00.0000000', 'timeZone' => 'Europe/Copenhagen'],
                'end' => ['dateTime' => '2026-09-14T14:00:00.0000000', 'timeZone' => 'Europe/Copenhagen'],
            ]]]),
            'graph.microsoft.com/v1.0/$batch' => Http::response(['responses' => []]),
        ]);

        $data = $this->actingAs($user)->getJson('/api/overview?from=2026-09-14&days=7&tz=Europe/Copenhagen')->assertOk()->json();
        $byName = collect($data['users'])->keyBy('name');
        $peter = $byName['Peter Peer']['items'][0];
        $this->assertSame('2026-09-14T07:00:00Z', $peter['s']);
        $this->assertSame('Team sync', $peter['sub']);
        $this->assertFalse($peter['ad']);
        $paula = $byName['Paula Peer']['items'][0];
        $this->assertTrue($paula['ad']);
        $this->assertSame('oof', $paula['st']);
        $me = $byName['Test Person']['items'][0];
        $this->assertTrue($me['pr']);
        $this->assertNull($me['sub']);
        $this->assertTrue($byName['Test Person']['is_me']);

        Http::assertSentCount(3);
        $this->actingAs($user)->getJson('/api/overview?from=2026-09-14&days=7&tz=Europe/Copenhagen')->assertOk();
        Http::assertSentCount(3); // served from cache

        $this->actingAs($user)->getJson('/api/overview?from=2026-09-14&days=7&tz=Europe/Copenhagen&refresh=1')->assertOk();
        $this->assertGreaterThan(3, count(Http::recorded()));
    }

    public function test_long_ranges_are_split_into_graph_windows(): void
    {
        $user = Fixtures::user();
        Fixtures::team();
        Http::fake([
            'graph.microsoft.com/v1.0/me/calendar/getSchedule' => Http::response(Fixtures::scheduleResponse(['peter@example.com' => []])),
            'graph.microsoft.com/v1.0/$batch' => Http::response(['responses' => []]),
        ]);
        $this->actingAs($user)->putJson('/api/settings', ['my_team_visible' => false]);

        $data = $this->actingAs($user)->getJson('/api/availability?users[]=peer-0001&from=2026-09-14&to=2027-09-14&tz=Europe/Copenhagen')->assertOk()->json();
        $this->assertCount(365, $data['days']);
        Http::assertSentCount(6); // 365 days / 62 = 6 getSchedule windows
        $this->actingAs($user)->getJson('/api/availability?users[]=peer-0001&from=2026-09-14&to=2027-09-16')->assertStatus(422);
    }

    public function test_availability_endpoint_validates_range(): void
    {
        $user = Fixtures::user();
        $this->actingAs($user)->putJson('/api/settings', ['demo_enabled' => true]);
        $this->actingAs($user)->getJson('/api/availability?users[]=demo-001&from=2026-09-14&to=2026-09-13')->assertStatus(422);
        $data = $this->actingAs($user)->getJson('/api/availability?users[]=demo-001&users[]=demo-002&from=2026-09-14&to=2026-09-19&tz=Europe/Copenhagen')->assertOk()->json();
        $this->assertCount(2, $data['users']);
        $this->assertCount(5, $data['days']);
    }

    public function test_own_photo_is_synced_and_served_with_cache_buster(): void
    {
        $user = Fixtures::user();
        Fixtures::team();
        $jpeg = "\xFF\xD8\xFF\xE0fake-jpeg";
        Http::fake([
            'graph.microsoft.com/v1.0/$batch' => Http::response(['responses' => [['id' => 'me-0001', 'status' => 200, 'headers' => ['Content-Type' => 'image/jpeg'], 'body' => base64_encode($jpeg)]]]),
        ]);

        $photoUrl = $this->actingAs($user)->getJson('/api/me')->assertOk()->json('user.photo_url');
        $this->assertMatchesRegularExpression('#^/api/photos/me-0001\?v=\d+$#', $photoUrl);
        $this->assertNotSame('/api/photos/me-0001?v=0', $photoUrl);
        $this->assertDatabaseHas('directory_users', ['id' => 'me-0001', 'has_photo' => true]);

        $response = $this->actingAs($user)->get($photoUrl)->assertOk()->assertHeader('Content-Type', 'image/jpeg');
        $this->assertSame($jpeg, $response->getContent() ?: file_get_contents(PhotoSyncService::pathFor('me-0001')));
    }

    public function test_photo_endpoint_returns_avatar_svg_when_no_photo(): void
    {
        $user = Fixtures::user();
        $this->actingAs($user)->get('/api/photos/me-0001')->assertOk()->assertHeader('Content-Type', 'image/svg+xml')->assertSee('TP', false);
        $this->actingAs($user)->get('/api/photos/nobody')->assertOk()->assertSee('?', false);
    }

    public function test_app_shell_renders_for_signed_in_user(): void
    {
        $user = Fixtures::user();
        $this->actingAs($user)->putJson('/api/settings', ['theme' => 'dark', 'locale' => 'da']);
        $html = $this->actingAs($user)->get('/')->assertOk()->getContent();
        $this->assertStringContainsString('data-theme="dark"', $html);
        $this->assertStringContainsString('window.__APP__', $html);
        $this->assertStringContainsString('assets/js/app.js', $html);
        $this->assertStringContainsString('"locale":"da"', $html);
        $this->assertStringContainsString('type="importmap"', $html);
        $this->assertStringContainsString('MiniCalendar.js?v='.config('calendar.version'), $html);
    }

    public function test_directory_search_and_managers(): void
    {
        $user = Fixtures::user();
        Fixtures::team();
        $this->actingAs($user)->getJson('/api/directory/users?q=peer')->assertOk()->assertJsonCount(2, 'users');
        $managers = $this->actingAs($user)->getJson('/api/directory/managers')->assertOk()->json('users');
        $this->assertSame(['Mona Manager'], array_column($managers, 'name'));
    }
}
