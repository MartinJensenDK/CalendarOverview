<?php

namespace App\Graph;

use RuntimeException;

/** The stored tokens can no longer be refreshed; the user must sign in again. */
class ReauthRequiredException extends RuntimeException
{
    public function __construct(string $message = 'Please sign in again.', public readonly ?string $reason = null)
    {
        parent::__construct($message);
    }
}
