#!/usr/bin/env python3
"""
Unit tests for Video2PPT
"""

import os
import unittest
import numpy as np
import cv2
from pptx import Presentation
from main import Video2PPT


class TestVideo2PPT(unittest.TestCase):
    def setUp(self):
        self.test_video = "test_synthetic.mp4"
        self.test_output = "test_output.pptx"
        
        # Create a synthetic 16:9 MP4 video (640x360, 20 frames at 10 fps = 2 seconds)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(self.test_video, fourcc, 10.0, (640, 360))
        
        for i in range(20):
            # Frame with varying color
            frame = np.full((360, 640, 3), (i * 12, 100, 200), dtype=np.uint8)
            out.write(frame)
        out.release()

    def tearDown(self):
        for path in [self.test_video, self.test_output]:
            if os.path.exists(path):
                os.remove(path)
        if os.path.exists("temp_frames"):
            import shutil
            shutil.rmtree("temp_frames")

    def test_invalid_interval(self):
        with self.assertRaises(ValueError):
            Video2PPT(self.test_video, fps_interval=0)
        with self.assertRaises(ValueError):
            Video2PPT(self.test_video, fps_interval=-1)

    def test_missing_video(self):
        with self.assertRaises(FileNotFoundError):
            Video2PPT("non_existent_file.mp4")

    def test_full_conversion_and_aspect_ratio(self):
        converter = Video2PPT(self.test_video, self.test_output, fps_interval=1)
        converter.convert()
        
        # Verify output presentation exists
        self.assertTrue(os.path.exists(self.test_output))
        
        # Verify temporary frames were cleaned up
        self.assertFalse(os.path.exists("temp_frames"))
        
        # Verify presentation contents
        prs = Presentation(self.test_output)
        # 1 title slide + extracted frame slides
        self.assertGreater(len(prs.slides), 1)
        
        # Verify aspect ratio matches video (640 / 360 = 1.7777...)
        expected_ratio = 640 / 360
        actual_ratio = prs.slide_width / prs.slide_height
        self.assertAlmostEqual(actual_ratio, expected_ratio, places=2)


if __name__ == '__main__':
    unittest.main()
