import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCoursesForAdmin, uploadDocument } from '../services/api';
import AppShell from '../components/AppShell';
import './AdminPage.css';

const AdminPage = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedLesson, setSelectedLesson] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const response = await getCoursesForAdmin();
      setCourses(response.data.data);
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  };

  const handleCourseChange = (e) => {
    setSelectedCourse(e.target.value);
    setSelectedModule('');
    setSelectedLesson('');
  };

  const handleModuleChange = (e) => {
    setSelectedModule(e.target.value);
    setSelectedLesson('');
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setMessage('Please select a PDF file');
        setMessageType('danger');
        setFile(null);
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) { // 10MB
        setMessage('File size should be less than 10MB');
        setMessageType('danger');
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setMessage('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedCourse || !selectedModule || !selectedLesson || !file) {
      setMessage('Please fill all fields and select a file');
      setMessageType('danger');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('courseId', selectedCourse);
      formData.append('moduleId', selectedModule);
      formData.append('lessonId', selectedLesson);
      formData.append('document', file);

      const response = await uploadDocument(formData);
      
      if (response.data.success) {
        setMessage('Document uploaded successfully!');
        setMessageType('success');
        // Reset form
        setSelectedCourse('');
        setSelectedModule('');
        setSelectedLesson('');
        setFile(null);
        // Reset file input
        document.getElementById('fileInput').value = '';
      }
    } catch (error) {
      console.error('Upload error:', error);
      setMessage(error.response?.data?.message || 'Failed to upload document');
      setMessageType('danger');
    } finally {
      setLoading(false);
    }
  };

  const getCourse = () => courses.find(c => c._id === selectedCourse);
  const getModule = () => getCourse()?.modules.find(m => m._id === selectedModule);

  return (
    <AppShell
      nav={[
        { key: 'upload', label: 'Upload document', active: true },
        { key: 'console', label: 'Admin console', to: '/admin-upload' },
        { key: 'lms', label: 'Back to LMS', onClick: () => navigate('/lms') }
      ]}
      eyebrow="Operations / Materials"
      title="Document upload"
    >
      <div className="admp">
        <div className="admp__intro">
          <p className="edu-label edu-label--accent">Attach a PDF</p>
          <h2 className="edu-h2">Give a lesson its <em>reading</em>.</h2>
        </div>
        <form onSubmit={handleSubmit} className="edu-panel edu-pop admp__form">
          <div className="edu-panel__head">
            <p className="edu-label edu-label--ink">Attach a PDF to a lesson</p>
            <span className="edu-label">PDF / 10 MB max</span>
          </div>
          <div className="edu-panel__body">
            {message && (
              <div className={`edu-alert ${messageType === 'success' ? 'edu-alert--success' : 'edu-alert--error'} admp__alert`} role="alert">
                <span className="admp__alert-text">{message}</span>
                <button type="button" className="admp__alert-close" onClick={() => setMessage('')} aria-label="Dismiss">
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
            )}

            <div className="edu-field">
              <label htmlFor="course">Course *</label>
              <select className="edu-select" id="course" value={selectedCourse} onChange={handleCourseChange} required>
                <option value="">Choose a course...</option>
                {courses.map(course => (
                  <option key={course._id} value={course._id}>{course.title}</option>
                ))}
              </select>
            </div>

            {selectedCourse && (
              <div className="edu-field">
                <label htmlFor="module">Module *</label>
                <select className="edu-select" id="module" value={selectedModule} onChange={handleModuleChange} required>
                  <option value="">Choose a module...</option>
                  {getCourse()?.modules.map(module => (
                    <option key={module._id} value={module._id}>{module.title}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedModule && (
              <div className="edu-field">
                <label htmlFor="lesson">Lesson *</label>
                <select className="edu-select" id="lesson" value={selectedLesson} onChange={(e) => setSelectedLesson(e.target.value)} required>
                  <option value="">Choose a lesson...</option>
                  {getModule()?.lessons.map(lesson => (
                    <option key={lesson._id} value={lesson._id}>
                      {lesson.title}{lesson.document ? ' (has document)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label htmlFor="fileInput" className={`admp__drop${file ? ' has-file' : ''}`}>
              <input type="file" id="fileInput" accept="application/pdf" onChange={handleFileChange} required />
              <i className="bi bi-file-earmark-arrow-up admp__drop-icon" aria-hidden="true"></i>
              <span className="admp__drop-title">{file ? 'Replace file' : 'Choose a PDF'}</span>
              <span className="edu-label">Accepted: PDF / Max 10 MB</span>
            </label>

            {file && (
              <div className="admp__file">
                <span className="admp__file-name">{file.name}</span>
                <span className="admp__file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            )}

            <button
              type="submit"
              className="edu-btn edu-btn--accent edu-btn--lg edu-btn--block admp__submit"
              disabled={loading || !selectedCourse || !selectedModule || !selectedLesson || !file}
            >
              {loading ? 'Uploading...' : 'Upload document'}
            </button>
          </div>
        </form>

        <ol className="admp__steps">
          <li><span>01</span>Select the course, module and lesson.</li>
          <li><span>02</span>Choose a PDF document (max 10 MB).</li>
          <li><span>03</span>Upload to attach the document to the lesson.</li>
          <li><span>04</span>Learners can then request an AI summary of it.</li>
        </ol>
      </div>
    </AppShell>
  );
};

export default AdminPage;
