const Request = require('../models/Request');
const Department = require('../models/Department');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const notify = require('../utils/notify');

// Helper: find the department this staff member belongs to, and their role in it
async function getMyDepartment(userId) {
  const asHod = await Department.findOne({ hod: userId });
  if (asHod) return { department: asHod, staffRole: 'HOD' };
  const asAdvisor = await Department.findOne({ advisors: userId });
  if (asAdvisor) return { department: asAdvisor, staffRole: 'Advisor' };
  return { department: null, staffRole: null };
}

// @desc  Get all requests relevant to the logged-in Advisor/HOD (queue + history)
// @route GET /api/department/requests
exports.getRequests = async (req, res) => {
  try {
    const { department, staffRole } = await getMyDepartment(req.user.id);
    if (!department) {
      return res.status(404).json({ success: false, message: 'You are not linked to any department yet' });
    }

    const me = await User.findById(req.user.id);
    const filter = { department: department._id, role: 'Student' };
    if (staffRole === 'Advisor' && me.year) {
      filter.year = me.year;
    }

    const students = await User.find(filter).select('_id');
    const studentIds = students.map(s => s._id);

    const requests = await Request.find({ student: { $in: studentIds } })
      .populate('student', 'name email year roomNumber room role')
      .populate('departmentApprovedBy', 'name')
      .populate('wardenApprovedBy', 'name')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Advisor or HOD approves/rejects a request at their stage
// @route PUT /api/department/requests/:id/department
exports.updateRequestDepartment = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    
    if (request.status !== 'Pending Department' || request.departmentStatus !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Department approval is already completed or not required.' });
    }

    if (status === 'Approved') {
      const me = await User.findById(req.user.id);
        
      request.departmentStatus = 'Approved';
      request.departmentApprovedBy = req.user.id;
      request.departmentApprovedByRole = me.role === 'Advisor' && me.year ? `Year ${me.year} Advisor` : me.role;
      request.departmentApprovedAt = new Date();

      if (request.type === 'Outpass') {
        request.status = 'Pending Warden';

        if (request.assignedWarden) {
          await request.populate('student', 'name email roomNumber department');
          const studentName = request.student ? request.student.name : 'Unknown';
          const studentId = request.student ? request.student.email : 'Unknown';
          const roomNo = request.student ? request.student.roomNumber : 'Unknown';

          const msg = `Outpass Request Pending Warden Approval — ${studentName}\n\nStudent Name: ${studentName}\nStudent ID: ${studentId}\nRoom: ${roomNo}\nDestination: ${request.destination}\n\nPlease login to the Smart Hostel Management System to review this request.\n\nThis email is only a notification.\nApproval must be completed through the website.`;

          await notify(request.assignedWarden, msg, request.type);
        }
      } else {
        request.status = 'Approved';
      }
    } else if (status === 'Rejected') {
      request.departmentStatus = 'Rejected';
      request.status = 'Rejected';
      request.rejectionReason = rejectionReason || 'Rejected by Department';
    } else {
      return res.status(400).json({ success: false, message: 'status must be Approved or Rejected' });
    }

    await request.save();
    await notify(request.student, `Your ${request.type} request was ${status.toLowerCase()} by Department.`, request.type);
    res.status(200).json({ success: true, data: request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  List students in the department (Advisor: assigned only via department link, HOD: all)
// @route GET /api/department/students
exports.getStudents = async (req, res) => {
  try {
    const { department, staffRole } = await getMyDepartment(req.user.id);
    if (!department) return res.status(404).json({ success: false, message: 'You are not linked to any department yet' });

    const me = await User.findById(req.user.id);
    const filter = { department: department._id, role: 'Student' };
    if (staffRole === 'Advisor' && me.year) {
      filter.year = me.year;
    }

    const students = await User.find(filter)
      .select('-password')
      .populate('hostel', 'name')
      .populate('room', 'roomNumber');

    res.status(200).json({ success: true, count: students.length, data: students });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  HOD-only: list advisors in the department
// @route GET /api/department/advisors
exports.getAdvisors = async (req, res) => {
  try {
    const { department, staffRole } = await getMyDepartment(req.user.id);
    if (!department) return res.status(404).json({ success: false, message: 'You are not linked to any department yet' });
    if (staffRole !== 'HOD') return res.status(403).json({ success: false, message: 'Only HOD can view advisor list' });

    const dept = await Department.findById(department._id).populate('advisors', 'name email');
    res.status(200).json({ success: true, data: dept.advisors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Mark/view attendance for department students (Advisor + HOD)
// @route POST /api/department/attendance
exports.markAttendance = async (req, res) => {
  try {
    const { records, date } = req.body; // records: [{ studentId, status }]
    if (!Array.isArray(records) || !date) {
      return res.status(400).json({ success: false, message: 'date and records[] are required' });
    }

    const day = new Date(date);
    day.setHours(0, 0, 0, 0);

    const results = [];
    for (const r of records) {
      const doc = await Attendance.findOneAndUpdate(
        { student: r.studentId, date: day },
        { status: r.status, markedBy: req.user.id },
        { new: true, upsert: true }
      );
      results.push(doc);
    }
    res.status(200).json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAttendance = async (req, res) => {
  try {
    const { department, staffRole } = await getMyDepartment(req.user.id);
    if (!department) return res.status(404).json({ success: false, message: 'You are not linked to any department yet' });

    const me = await User.findById(req.user.id);
    const stuFilter = { department: department._id, role: 'Student' };
    if (staffRole === 'Advisor' && me.year) {
      stuFilter.year = me.year;
    }

    const students = await User.find(stuFilter).select('_id');
    const studentIds = students.map(s => s._id);

    const filter = { student: { $in: studentIds } };
    if (req.query.date) {
      const day = new Date(req.query.date);
      day.setHours(0, 0, 0, 0);
      filter.date = day;
    }

    const records = await Attendance.find(filter).populate('student', 'name').sort('-date');
    res.status(200).json({ success: true, count: records.length, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Department analytics (HOD view, and useful for Advisor too)
// @route GET /api/department/analytics
exports.getAnalytics = async (req, res) => {
  try {
    const { department, staffRole } = await getMyDepartment(req.user.id);
    if (!department) return res.status(404).json({ success: false, message: 'You are not linked to any department yet' });

    const me = await User.findById(req.user.id);
    const stuFilter = { department: department._id, role: 'Student' };
    if (staffRole === 'Advisor' && me.year) {
      stuFilter.year = me.year;
    }

    const students = await User.find(stuFilter).select('_id');
    const studentIds = students.map(s => s._id);

    const [totalStudents, pendingLeave, pendingOutpass, approvedLeave, approvedOutpass, rejected] = await Promise.all([
      User.countDocuments(stuFilter),
      Request.countDocuments({ student: { $in: studentIds }, type: 'Leave', status: { $in: ['Pending Department'] } }),
      Request.countDocuments({ student: { $in: studentIds }, type: 'Outpass', status: { $in: ['Pending Department', 'Pending Warden'] } }),
      Request.countDocuments({ student: { $in: studentIds }, type: 'Leave', status: 'Approved' }),
      Request.countDocuments({ student: { $in: studentIds }, type: 'Outpass', status: 'Approved' }),
      Request.countDocuments({ student: { $in: studentIds }, status: 'Rejected' })
    ]);

    res.status(200).json({
      success: true,
      data: { totalStudents, pendingLeave, pendingOutpass, approvedLeave, approvedOutpass, rejected }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Which role (HOD/Advisor) the logged-in department user has, for frontend UI gating
// @route GET /api/department/me
exports.getMyRole = async (req, res) => {
  try {
    const { department, staffRole } = await getMyDepartment(req.user.id);
    if (!department) return res.status(404).json({ success: false, message: 'You are not linked to any department yet' });
    res.status(200).json({ success: true, data: { staffRole, department: { id: department._id, name: department.name } } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
