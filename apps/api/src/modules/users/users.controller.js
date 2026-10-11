import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ApiResponse } from '../../core/utils/apiResponse.js';
import { usersService } from './users.service.js';

export const getUsersById = asyncHandler(async (req, res) => {
  const result = await usersService.getById(req.params.id);
  return res.status(200).json(new ApiResponse(200, result, 'Fetched successfully'));
});
