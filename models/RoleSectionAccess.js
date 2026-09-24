import mongoose from 'mongoose';

const roleSectionAccessSchema = new mongoose.Schema({
  role: { type: String, enum: ['admin', 'cajero'], required: true, unique: true },
  sections: { type: [String], default: [] }
}, { timestamps: true });

export default mongoose.model('RoleSectionAccess', roleSectionAccessSchema);
