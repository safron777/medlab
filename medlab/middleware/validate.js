const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'Validation error',
      details: (result.error.issues ?? []).map(e => ({ field: e.path.join('.'), message: e.message })),
    });
  }
  req.body = result.data;
  next();
};

module.exports = { validate };
