/**
 * Express middleware factory for Zod schema validation on req.body.
 * Usage: router.post('/route', validate(myZodSchema), handler)
 *
 * On failure: responds with 400 + { error: 'First error message' }
 * On success: replaces req.body with the parsed (coerced) data and calls next()
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.errors[0];
      return res.status(400).json({ error: first?.message || 'Invalid request data.' });
    }
    req.body = result.data;
    return next();
  };
}

module.exports = { validate };
