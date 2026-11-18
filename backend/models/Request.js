const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedWarden: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    enum: ['Outpass', 'Leave'],
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  destination: {
    type: String,
    required: function () { return this.type === 'Outpass'; }
  },
  outTime: { type: String }, // for Outpass
  expectedReturnTime: { type: String }, // for Outpass
  fromDate: {
    type: Date,
    required: true
  },
  toDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending Department', 'Pending Warden', 'Approved', 'Rejected'],
    default: 'Pending Department'
  },
  // Audit trail - who acted, and when, with real names captured at approval time
  departmentStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  departmentApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  departmentApprovedByRole: { type: String },
  departmentApprovedAt: { type: Date },
  wardenStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Not Required'],
    default: 'Pending'
  },
  wardenApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  wardenApprovedAt: { type: Date },

  rejectionReason: {
    type: String
  }
}, { timestamps: true });

requestSchema.pre('validate', function () {
  // Leave never goes to Warden. Outpass always does.
  if (this.type === 'Leave') {
    this.wardenStatus = 'Not Required';
  }
});

module.exports = mongoose.model('Request', requestSchema);
