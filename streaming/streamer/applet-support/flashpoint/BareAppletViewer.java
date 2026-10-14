package flashpoint;

import java.awt.AWTEvent;
import java.awt.Component;
import java.awt.Frame;
import java.awt.Label;
import java.awt.Toolkit;
import java.awt.event.WindowEvent;
import java.lang.instrument.Instrumentation;

/** Java agent that strips appletviewer's menu bar and status line, leaving only the applet. */
public final class BareAppletViewer {
    public static void premain(String args, Instrumentation inst) {
        Toolkit.getDefaultToolkit().addAWTEventListener(event -> {
            Object source = event.getSource();
            if (event.getID() != WindowEvent.WINDOW_OPENED
                    || !source.getClass().getName().equals("sun.applet.AppletViewer")) {
                return;
            }
            Frame frame = (Frame) source;
            frame.setMenuBar(null);
            for (Component component : frame.getComponents()) {
                if (component instanceof Label) {
                    frame.remove(component);
                }
            }
            frame.pack();
        }, AWTEvent.WINDOW_EVENT_MASK);
    }
}
