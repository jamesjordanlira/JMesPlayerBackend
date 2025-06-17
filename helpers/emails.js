import nodemailer from 'nodemailer';
import dotenv from 'dotenv';


dotenv.config(); // Cargar variables de entorno

export const emailRegistro = async (datos) => {
    const { nombre, apellidos, email, token } = datos;
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
            user: process.env.user_email,
            pass: process.env.pass_email
        }
    });

    // Info del email
    const info = await transporter.sendMail({
        from: '"JMesPlayer", <2519260008jjordanc@gmail.com',
        to: email,
        subject: 'JMesPlayer - Confirma tu cuenta',
        text: 'Confirma tu cuenta para disfrutar de nuestros servicios.',
        html: `<p>Hola ${nombre} ${apellidos} Comprueba tu cuenta de JMesPlayer.</p>
               <p>
                  Tu cuenta esta casí lista, solo debes seguir el siguiente enlace:
                  <a href="${process.env.frontend_url}/confirmar/${token}">Confirmar cuenta</a>
               </p>
               <p>Si tu no solicitaste este enlace, puedes ignorar este Email.</p>
               `,     
    });
};

export const emailOlvidePassword = async (datos) => {
    const { nombre, apellidos, email, token } = datos;
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
            user: process.env.user_email,
            pass: process.env.pass_email
        }
    });

     // Info del email
     const info = await transporter.sendMail({
        from: '"Panaderia MJ", <2519260008jjordanc@gmail.com',
        to: email,
        subject: 'JMesPlayer - Reestablece tu password',
        text: 'Reestablece tu password lo antes posible no lo dejes pasar.',
        html: `<p>Hola ${nombre} ${apellidos} Has solicitado reestablecer tu password de tu cuenta Agile.</p>
               <p>
                  sigue este enlace para generar un nuevo password:
                  <a href="${process.env.frontend_url}/forget-password/${token}">Confirmar cuenta</a>
               </p>
               <p>Si tu no solicitaste este enlace, puedes ignorar este Email.</p>
               `,      
    });
};


