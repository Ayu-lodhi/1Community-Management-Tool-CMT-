const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { emailQueue, certificateQueue } = require('./queue.service');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

try {
  const queues = [];
  if (emailQueue) queues.push(new BullMQAdapter(emailQueue));
  if (certificateQueue) queues.push(new BullMQAdapter(certificateQueue));

  createBullBoard({
    queues,
    serverAdapter,
  });
} catch (err) {
  console.warn('Failed to initialize BullBoard queues:', err.message);
}

module.exports = {
  queueBoardRouter: serverAdapter.getRouter(),
};
