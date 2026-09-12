<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DirectoryUser;
use App\Services\AvatarService;
use App\Services\PhotoSyncService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class PhotoController extends Controller
{
    public function show(Request $request, string $id): Response
    {
        $user = DirectoryUser::find($id);
        $path = PhotoSyncService::pathFor($id);
        $headers = ['Cache-Control' => 'private, max-age=86400'];

        if ($user && $user->has_photo && is_file($path)) {
            $etag = '"'.md5_file($path).'"';
            if ($request->header('If-None-Match') === $etag) {
                return response('', 304, $headers + ['ETag' => $etag]);
            }

            return response()->file($path, $headers + ['Content-Type' => 'image/jpeg', 'ETag' => $etag]);
        }

        $initials = $user ? $user->initials() : '?';
        $svg = AvatarService::svg($id, $initials);

        return response($svg, 200, $headers + ['Content-Type' => 'image/svg+xml']);
    }
}
