/** Map body-parser entity.too.large to a safe client message (no infra details). */
export function jsonBodyErrorHandler(err, req, res, next) {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Image is too large. Please choose an image smaller than 8 MB.',
    });
  }
  next(err);
}
