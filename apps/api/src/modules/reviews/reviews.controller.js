const Review = require('./reviews.model');

exports.getAllReviews = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const hasExplicitLimit = req.query.limit !== undefined;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || (hasExplicitLimit ? 50 : 200)));
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.countDocuments(),
    ]);

    res.json({
      success: true,
      data: reviews,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMyReviews = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const hasExplicitLimit = req.query.limit !== undefined;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || (hasExplicitLimit ? 50 : 200)));
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ reviewedBy: req.user.sub }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.countDocuments({ reviewedBy: req.user.sub }),
    ]);

    res.json({
      success: true,
      data: reviews,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createReview = async (req, res) => {
  try {
    const { studentId, studentName, eventId, eventTitle, rating, feedback } = req.body;
    if (!studentId || !studentName || rating === undefined || !feedback) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const numRating = parseInt(rating, 10);
    if (isNaN(numRating) || numRating < 1 || numRating > 5 || Number(rating) !== numRating) {
      return res.status(400).json({ success: false, message: 'Rating must be an integer between 1 and 5' });
    }

    if (studentId.toString() === req.user.sub.toString()) {
      return res.status(403).json({ success: false, message: 'Self-reviews are not permitted' });
    }

    if (eventId) {
      const existing = await Review.findOne({
        reviewedBy: req.user.sub,
        studentId,
        eventId,
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'You have already reviewed this student for this event',
        });
      }
    }

    const review = await Review.create({
      studentId,
      studentName,
      eventId: eventId || null,
      eventTitle: eventTitle || '',
      rating: numRating,
      feedback: String(feedback).trim(),
      reviewedBy: req.user.sub,
      reviewerName: req.user.name || 'Reviewer',
    });

    res.status(201).json({ success: true, message: 'Review submitted', data: review });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
