import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ApiResponse } from '../../core/utils/apiResponse.js';
import { shiftsService } from './shifts.service.js';

export const getShiftsById = asyncHandler(async (req, res) => {
  const result = await shiftsService.getById(req.params.id);
  return res.status(200).json(new ApiResponse(200, result, 'Fetched successfully'));
});
