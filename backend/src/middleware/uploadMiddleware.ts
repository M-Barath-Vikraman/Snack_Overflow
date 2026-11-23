import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorMiddleware';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
});

export const imageUploadMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  upload.single('image')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError('File size exceeds the maximum limit of 5 MB.', 400, 'FILE_TOO_LARGE')
          );
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(
            new AppError(
              "Unexpected field name in multipart request. Expected field name 'image'.",
              400,
              'INVALID_FIELD_NAME'
            )
          );
        }
        return next(new AppError(`File upload error: ${err.message}`, 400, 'UPLOAD_ERROR'));
      }
      return next(new AppError(err.message || 'Error parsing upload request', 400, 'UPLOAD_ERROR'));
    }

    if (!req.file) {
      return next(
        new AppError(
          "Image file is required under form-data field 'image'.",
          400,
          'MISSING_IMAGE_FILE'
        )
      );
    }

    next();
  });
};
