<?php

namespace App\Http\Controllers\Api;

use App\Graph\GraphTokenProvider;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EntraGroupController extends Controller
{
    public function search(Request $request, GraphTokenProvider $tokens): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $graph = $tokens->client($request->user());
        $query = ['$select' => 'id,displayName,description,mail,groupTypes,securityEnabled', '$top' => 20, '$count' => 'true', '$orderby' => 'displayName'];
        if ($q !== '') {
            $query['$search'] = '"displayName:'.str_replace('"', '', $q).'"';
        }
        $data = $graph->get('/groups', $query, ['ConsistencyLevel' => 'eventual']);

        $groups = array_map(fn ($g) => [
            'id' => $g['id'],
            'name' => $g['displayName'] ?? $g['id'],
            'description' => $g['description'] ?? null,
            'mail' => $g['mail'] ?? null,
            'kind' => in_array('Unified', $g['groupTypes'] ?? [], true) ? 'm365' : (($g['securityEnabled'] ?? false) ? 'security' : 'distribution'),
        ], $data['value'] ?? []);

        return response()->json(['groups' => $groups]);
    }

    public function count(Request $request, GraphTokenProvider $tokens, string $id): JsonResponse
    {
        $graph = $tokens->client($request->user());
        $response = $graph->getRaw('/groups/'.rawurlencode($id).'/transitiveMembers/microsoft.graph.user/$count', ['ConsistencyLevel' => 'eventual']);

        return response()->json(['count' => $response ? (int) $response->body() : 0]);
    }
}
