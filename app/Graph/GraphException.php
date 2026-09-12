<?php

namespace App\Graph;

use RuntimeException;

class GraphException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status = 0,
        public readonly ?string $graphCode = null,
        public readonly ?string $path = null,
    ) {
        parent::__construct($message, $status);
    }

    public static function fromResponse(int $status, array|string|null $body, string $path): self
    {
        $code = null;
        $message = 'Microsoft Graph request failed';
        if (is_array($body)) {
            $code = $body['error']['code'] ?? null;
            $message = $body['error']['message'] ?? $message;
        } elseif (is_string($body) && $body !== '') {
            $message = mb_substr($body, 0, 300);
        }

        return new self($message, $status, $code, $path);
    }

    public function isAuthError(): bool
    {
        return $this->status === 401;
    }

    public function isConsentError(): bool
    {
        return $this->status === 403;
    }

    public function isNotFound(): bool
    {
        return $this->status === 404;
    }
}
