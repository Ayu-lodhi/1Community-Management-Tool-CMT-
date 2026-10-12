const Review = require('./reviews.model');

exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 });
    res.json({ success: true, data: reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMyReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ reviewedBy: req.user.sub }).sort({ createdAt: -1 });
    res.json({ success: true, data: reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createReview = async (req, res) => {
  try {
    const { studentId, studentName, eventId, eventTitle, rating, feedback } = req.body;
    if (!studentId || !studentName || !rating || !feedback) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const review = await Review.create({
      studentId,
      studentName,
      eventId,
      eventTitle,
      rating: Number(rating),
      feedback,
      reviewedBy: req.user.sub,
      reviewerName: req.user.name || 'Reviewer',
    });

    res.status(201).json({ success: true, message: 'Review submitted', data: review });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
