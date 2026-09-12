<?php

namespace App\Services;

use App\Support\EnvWriter;
use App\Support\Installer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use PDO;
use PDOException;
use RuntimeException;

/**
 * Shared by the web wizard (/setup) and `php artisan calendar:install`.
 */
class InstallService
{
    public static function databaseRules(): array
    {
        return [
            'db_connection' => ['required', 'in:sqlite,mysql,mariadb,pgsql'],
            'db_host' => ['required_unless:db_connection,sqlite', 'nullable', 'string', 'max:255'],
            'db_port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'db_database' => ['required_unless:db_connection,sqlite', 'nullable', 'string', 'max:255'],
            'db_username' => ['required_unless:db_connection,sqlite', 'nullable', 'string', 'max:255'],
            'db_password' => ['nullable', 'string', 'max:255'],
        ];
    }

    public static function rules(): array
    {
        return self::databaseRules() + [
            'app_name' => ['required', 'string', 'max:80'],
            'app_url' => ['required', 'url', 'max:255'],
            'app_locale' => ['required', 'in:en,da'],
            'ms_tenant_id' => ['nullable', 'string', 'max:128'],
            'ms_client_id' => ['nullable', 'string', 'max:128'],
            'ms_client_secret' => ['nullable', 'string', 'max:255'],
            'ms_allowed_domains' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function currentValues(?Request $request = null): array
    {
        return [
            'app_name' => config('app.name') === 'Laravel' ? 'Calendar overview' : config('app.name'),
            'app_url' => $request ? $request->getSchemeAndHttpHost() : config('app.url'),
            'app_locale' => in_array(config('app.locale'), ['en', 'da'], true) ? config('app.locale') : 'en',
            'db_connection' => config('database.default', 'sqlite'),
            'db_host' => config('database.connections.mysql.host', '127.0.0.1'),
            'db_port' => config('database.connections.mysql.port', 3306),
            'db_database' => config('database.default') === 'sqlite' ? '' : config('database.connections.'.config('database.default').'.database', ''),
            'db_username' => config('database.default') === 'sqlite' ? '' : config('database.connections.'.config('database.default').'.username', ''),
            'ms_tenant_id' => config('calendar.tenant_id'),
            'ms_client_id' => config('calendar.client_id'),
            'ms_has_secret' => filled(config('calendar.client_secret')),
            'ms_allowed_domains' => implode(',', config('calendar.allowed_domains')),
        ];
    }

    /** Environment checks shown on the wizard. */
    public function checks(): array
    {
        $ext = fn (string $name) => extension_loaded($name);

        return [
            ['label' => 'PHP '.PHP_VERSION, 'ok' => version_compare(PHP_VERSION, '8.3.0', '>=')],
            ['label' => 'ext-curl', 'ok' => $ext('curl')],
            ['label' => 'ext-mbstring', 'ok' => $ext('mbstring')],
            ['label' => 'ext-openssl', 'ok' => $ext('openssl')],
            ['label' => 'ext-pdo_sqlite', 'ok' => $ext('pdo_sqlite')],
            ['label' => 'ext-pdo_mysql', 'ok' => $ext('pdo_mysql')],
            ['label' => 'storage/ writable', 'ok' => is_writable(storage_path())],
            ['label' => '.env writable', 'ok' => EnvWriter::forApp()->isWritable()],
        ];
    }

    /** @return array{ok: bool, message: string} */
    public function testDatabase(array $data): array
    {
        try {
            $pdo = $this->pdo($data);
            $version = $pdo->getAttribute(PDO::ATTR_SERVER_VERSION);

            return ['ok' => true, 'message' => __('Connected').' ('.$data['db_connection'].' '.$version.')'];
        } catch (PDOException|RuntimeException $e) {
            return ['ok' => false, 'message' => $e->getMessage()];
        }
    }

    private function pdo(array $data): PDO
    {
        $driver = $data['db_connection'];
        if ($driver === 'sqlite') {
            $path = $this->sqlitePath();
            if (! is_file($path)) {
                if (@touch($path) === false) {
                    throw new RuntimeException("Cannot create {$path}");
                }
            }

            return new PDO('sqlite:'.$path);
        }
        $port = $data['db_port'] ?: ($driver === 'pgsql' ? 5432 : 3306);
        $dsnDriver = $driver === 'mariadb' ? 'mysql' : $driver;
        $dsn = "{$dsnDriver}:host={$data['db_host']};port={$port};dbname={$data['db_database']}";

        return new PDO($dsn, $data['db_username'] ?? '', $data['db_password'] ?? '', [PDO::ATTR_TIMEOUT => 5, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    }

    public function sqlitePath(): string
    {
        return database_path('database.sqlite');
    }

    /** Writes .env, switches the runtime connection, migrates and locks the wizard. */
    public function install(array $data): void
    {
        $test = $this->testDatabase($data);
        if (! $test['ok']) {
            throw new RuntimeException(__('Database connection failed: :message', ['message' => $test['message']]));
        }

        $driver = $data['db_connection'];
        $env = [
            'APP_NAME' => $data['app_name'],
            'APP_URL' => rtrim($data['app_url'], '/'),
            'APP_LOCALE' => $data['app_locale'],
            'APP_ENV' => 'production',
            'APP_DEBUG' => false,
            'SESSION_SECURE_COOKIE' => str_starts_with($data['app_url'], 'https://'),
            'DB_CONNECTION' => $driver,
        ];
        if ($driver !== 'sqlite') {
            $env += [
                'DB_HOST' => $data['db_host'],
                'DB_PORT' => $data['db_port'] ?: ($driver === 'pgsql' ? 5432 : 3306),
                'DB_DATABASE' => $data['db_database'],
                'DB_USERNAME' => $data['db_username'],
                'DB_PASSWORD' => $data['db_password'] ?? '',
            ];
        }
        foreach (['ms_tenant_id' => 'MS_TENANT_ID', 'ms_client_id' => 'MS_CLIENT_ID', 'ms_client_secret' => 'MS_CLIENT_SECRET', 'ms_allowed_domains' => 'MS_ALLOWED_DOMAINS'] as $field => $key) {
            if (array_key_exists($field, $data) && $data[$field] !== null && $data[$field] !== '') {
                $env[$key] = $data[$field];
            }
        }

        $writer = EnvWriter::forApp();
        if (! $writer->isWritable()) {
            throw new RuntimeException(__('The file :path is not writable.', ['path' => $writer->path()]));
        }
        $writer->write($env);

        // Point the running application at the chosen database and migrate.
        config(['database.default' => $driver]);
        if ($driver === 'sqlite') {
            config(['database.connections.sqlite.database' => $this->sqlitePath()]);
        } else {
            config(["database.connections.{$driver}.host" => $data['db_host']]);
            config(["database.connections.{$driver}.port" => $env['DB_PORT']]);
            config(["database.connections.{$driver}.database" => $data['db_database']]);
            config(["database.connections.{$driver}.username" => $data['db_username']]);
            config(["database.connections.{$driver}.password" => $data['db_password'] ?? '']);
        }
        DB::purge($driver);
        DB::setDefaultConnection($driver);

        Artisan::call('migrate', ['--force' => true, '--no-interaction' => true]);
        Installer::markInstalled();
        Artisan::call('config:clear');
    }
}
