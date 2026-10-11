import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ApiResponse } from '../../core/utils/apiResponse.js';
import { super_adminService } from './super-admin.service.js';

export const getSuper_adminById = asyncHandler(async (req, res) => {
  const result = await super_adminService.getById(req.params.id);
  return res.status(200).json(new ApiResponse(200, result, 'Fetched successfully'));
});
