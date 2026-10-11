// ====================================================================
// BaseController — ABSTRACTION
// --------------------------------------------------------------------
// Wraps business service calls with consistent HTTP handling.
// Subclasses inherit error handling, response formatting.
// ====================================================================

class BaseController {
  constructor(service) {
    if (!service) throw new Error('Controller requires a service');
    this.service = service;  // Encapsulation

    // Bind methods so `this` works when passed as route handlers
    this.getAll = this.getAll.bind(this);
    this.getOne = this.getOne.bind(this);
    this.create = this.create.bind(this);
    this.update = this.update.bind(this);
    this.remove = this.remove.bind(this);
  }

  /**
   * Standard async handler — POLYMORPHISM through overrides
   */
  async _handle(res, fn) {
    try {
      const result = await fn();
      return res.json({ success: true, data: result });
    } catch (error) {
      const status = error.status || 400;
      return res.status(status).json({ success: false, message: error.message });
    }
  }

  async getAll(req, res) {
    return this._handle(res, () => this.service.getAll(req.query));
  }

  async getOne(req, res) {
    return this._handle(res, () => this.service.getById(req.params.id));
  }

  async create(req, res) {
    return this._handle(res, () => this.service.create(req.body, req.user));
  }

  async update(req, res) {
    return this._handle(res, () => this.service.update(req.params.id, req.body));
  }

  async remove(req, res) {
    return this._handle(res, () => this.service.delete(req.params.id));
  }
}

module.exports = BaseController;
