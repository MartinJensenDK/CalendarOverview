<?php

namespace App\Graph;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Thin wrapper around Microsoft Graph v1.0 for one delegated access token.
 */
class GraphClient
{
    public const BATCH_LIMIT = 20;

    private string $base;

    public function __construct(private readonly string $accessToken)
    {
        $this->base = rtrim(config('calendar.graph'), '/');
    }

    public function token(): string
    {
        return $this->accessToken;
    }

    public function pending(array $headers = []): PendingRequest
    {
        return Http::withToken($this->accessToken)
            ->acceptJson()
            ->withHeaders($headers)
            ->timeout(40)
            ->connectTimeout(10);
    }

    public function url(string $path): string
    {
        if (str_starts_with($path, 'http')) {
            return $path;
        }

        return $this->base.'/'.ltrim($path, '/');
    }

    public function get(string $path, array $query = [], array $headers = []): array
    {
        $response = $this->send(fn () => $this->pending($headers)->get($this->url($path), $query));

        return $this->decode($response, $path);
    }

    public function post(string $path, array $body = [], array $headers = []): array
    {
        $response = $this->send(fn () => $this->pending($headers)->post($this->url($path), $body));

        return $this->decode($response, $path);
    }

    /** Follows @odata.nextLink and returns the merged "value" array. */
    public function getAll(string $path, array $query = [], array $headers = [], int $maxPages = 100): array
    {
        $items = [];
        $next = $this->url($path);
        $pages = 0;
        while ($next && $pages < $maxPages) {
            $response = $this->send(fn () => $this->pending($headers)->get($next, $pages === 0 ? $query : []));
            $data = $this->decode($response, $path);
            foreach ($data['value'] ?? [] as $item) {
                $items[] = $item;
            }
            $next = $data['@odata.nextLink'] ?? null;
            $pages++;
        }

        return $items;
    }

    /** Raw GET, returns null on 404 (e.g. no profile photo). */
    public function getRaw(string $path, array $headers = []): ?Response
    {
        $response = $this->send(fn () => $this->pending($headers)->get($this->url($path)));
        if ($response->status() === 404) {
            return null;
        }
        if ($response->failed()) {
            throw GraphException::fromResponse($response->status(), $response->json() ?? $response->body(), $path);
        }

        return $response;
    }

    /**
     * JSON batch. $requests: [['id' => 'x', 'method' => 'GET', 'url' => '/users/..', 'headers' => [], 'body' => []]].
     * Returns responses keyed by id: ['status' => int, 'headers' => [], 'body' => mixed].
     */
    public function batch(array $requests): array
    {
        $results = [];
        foreach (array_chunk($requests, self::BATCH_LIMIT) as $chunk) {
            $payload = ['requests' => array_map(function ($r) {
                $entry = ['id' => (string) $r['id'], 'method' => $r['method'] ?? 'GET', 'url' => $r['url']];
                if (! empty($r['headers'])) {
                    $entry['headers'] = $r['headers'];
                }
                if (isset($r['body'])) {
                    $entry['body'] = $r['body'];
                    $entry['headers'] = ($entry['headers'] ?? []) + ['Content-Type' => 'application/json'];
                }

                return $entry;
            }, $chunk)];
            $data = $this->post('/$batch', $payload);
            foreach ($data['responses'] ?? [] as $resp) {
                $results[$resp['id']] = [
                    'status' => (int) ($resp['status'] ?? 0),
                    'headers' => $resp['headers'] ?? [],
                    'body' => $resp['body'] ?? null,
                ];
            }
        }

        return $results;
    }

    /**
     * Run several requests concurrently. $calls: key => fn(PendingRequest $req): PendingRequest|Response.
     * Each callable receives an authenticated request and must return the promise (e.g. $req->post(...)).
     * Returns key => Response (failed responses are returned, not thrown).
     */
    public function pool(array $calls): array
    {
        if ($calls === []) {
            return [];
        }

        $responses = Http::pool(function (Pool $pool) use ($calls) {
            $list = [];
            foreach ($calls as $key => $call) {
                $req = $pool->as((string) $key)
                    ->withToken($this->accessToken)
                    ->acceptJson()
                    ->timeout(40)
                    ->connectTimeout(10);
                $list[] = $call($req, $this);
            }

            return $list;
        });

        return $responses;
    }

    private function send(callable $fn): Response
    {
        /** @var Response $response */
        $response = $fn();
        if (in_array($response->status(), [429, 503, 504], true)) {
            $wait = (int) ($response->header('Retry-After') ?: 2);
            usleep(min($wait, 8) * 1_000_000);
            $response = $fn();
        }

        return $response;
    }

    private function decode(Response $response, string $path): array
    {
        if ($response->failed()) {
            throw GraphException::fromResponse($response->status(), $response->json() ?? $response->body(), $path);
        }

        return $response->json() ?? [];
    }
}
