<?php

namespace Tests\Feature;

use App\Support\EnvWriter;
use Tests\TestCase;

class InstallTest extends TestCase
{
    protected function markInstalled(): bool
    {
        return false;
    }

    public function test_requests_redirect_to_setup_until_installed(): void
    {
        $this->get('/')->assertRedirect('/setup');
        $this->get('/login')->assertRedirect('/setup');
        $this->getJson('/api/me')->assertStatus(503)->assertJsonPath('error', 'not_installed');
        $this->get('/setup')->assertOk()->assertSee('Set up your calendar overview');
    }

    public function test_database_test_endpoint_validates_and_reports(): void
    {
        $this->postJson('/setup/test-database', ['db_connection' => 'mysql'])->assertStatus(422);
        $this->postJson('/setup/test-database', ['db_connection' => 'mysql', 'db_host' => '127.0.0.1', 'db_port' => 1, 'db_database' => 'x', 'db_username' => 'x', 'db_password' => 'x'])
            ->assertOk()->assertJsonPath('ok', false);
    }

    public function test_env_writer_replaces_and_appends_keys(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'env');
        file_put_contents($path, "APP_NAME=Laravel\n# DB_HOST=127.0.0.1\nOTHER=1\n");
        $writer = new EnvWriter($path);
        $writer->write(['APP_NAME' => 'Calendar overview', 'DB_HOST' => 'db.local', 'MS_CLIENT_SECRET' => 'a b"c', 'NEW_KEY' => true]);
        $content = file_get_contents($path);
        unlink($path);

        $this->assertStringContainsString('APP_NAME="Calendar overview"', $content);
        $this->assertStringContainsString("\nDB_HOST=db.local\n", $content);
        $this->assertStringContainsString('MS_CLIENT_SECRET="a b\"c"', $content);
        $this->assertStringContainsString('NEW_KEY=true', $content);
        $this->assertStringContainsString('OTHER=1', $content);
        $this->assertStringNotContainsString('# DB_HOST', $content);
    }
}
