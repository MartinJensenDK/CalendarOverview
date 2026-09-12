<?php

namespace App\Http\Requests;

use App\Models\Group;
use Illuminate\Foundation\Http\FormRequest;

class GroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:80'],
            'type' => ['required', 'in:'.Group::TYPE_MANUAL.','.Group::TYPE_ENTRA],
            'members' => ['array', 'max:500'],
            'members.*' => ['string', 'max:64', 'exists:directory_users,id'],
            'managers' => ['array', 'max:50'],
            'managers.*' => ['string', 'max:64', 'exists:directory_users,id'],
            'entra_group_id' => ['required_if:type,'.Group::TYPE_ENTRA, 'nullable', 'string', 'max:64'],
            'entra_group_name' => ['nullable', 'string', 'max:255'],
            'visible' => ['sometimes', 'boolean'],
        ];
    }
}
